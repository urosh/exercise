'use strict';
const uuidv1 = require('uuid/v1');
/*
 * Current implementation does not connect to a database, but to add 
 * this communication is quite simple. In this case objects, accounts, pendingTransactions, 
 * completedTransactions and rejectedTransactions are simulating the database. So each modification
 * of these objects can be replaced by a call to the database. 
 * 
 * Another possibility to make this module more reliable is to use it in combination with Redis. This
 * would allow to have multiple modules running on independent server instances, which would make sure 
 * the module is always available, and that it scales well. 
 * 
 * In order for this to function properly we need each module to be data as much as possible data 
 * independent. The module should receive the request pass it to the database or store it in Redis, and 
 * run the scheduler. Ideally each transaction would be added to the queue, and each module instance would check the 
 * queue and when there is a transaction to process would take transaction id from the queue, run the transaction and
 * update the rest of the system. This would make sure if a server instance receive the transaction request and then goes 
 * down, other instances would be able to pick up the transaction from the queue and execute it. 
 *  
 */

module.exports = () => {
	let accounts = {};
	let history = {};
	
	let transactions = {};
	let pendingTransactions = {};
	let completedTransactions = {};
	let failedTransactions = {};

	const REFUND = 'refund';
	const FUND = 'fund';
	const PENDING = 'pending';
	const COMPLETED = 'completed';
	const REJECTED = 'rejected';
	const ERROR = 'error';

	// Tick interval 25 seconds, so we have at least two checks within one minute.
	const CHECK_INTERVAL = 25 * 1000;
	const INITIAL_BALANCE = 100;
	const allowedTransactionStatus = [PENDING, COMPLETED, REJECTED];
	const allowedTransactionTypes = [REFUND, FUND];

	const init = () => {
		
		accounts = {
			'A': {
				balance: INITIAL_BALANCE,
				pastTransactions: []
			},
			'B': {
				balance: 0,
				pastTransactions: []
			}
		};

		// Start the scheduler
		setInterval(timeTickCheck, CHECK_INTERVAL);
	}

		
	/**
	 * 
	 * Helper function that checks if the provided date is a valie date object. 
	 * 
	 * @param {Object} date Date value to be checked
	 * @return {Boolean} True/False value that shows wheter the provided date is a valie date object.  
	 */
	const isValidDate = date => date && Object.prototype.toString.call(date) === "[object Date]" && !isNaN(date);
	
	const timeTickCheck = () => {
		// Check the current minute
		let now = getUtcNow();
		executeScheduledJobs(now);
		
		// Check the previous minute, to make sure we didn't skip a transaction
		let previousMinute = getUtcNow();
		previousMinute.setMinutes(now.getMinutes() -1);
		executeScheduledJobs(previousMinute);

	};

	const executeScheduledJobs = (now) => {
		//let now = new Date();
		let nowTimeStamp = generateTimeStamp(now);
		
		if(!pendingTransactions[nowTimeStamp]){
			return;
		}

		Object.keys(pendingTransactions[nowTimeStamp]).map(transactionId => {
			if(executeTransaction(transactionId) === ERROR) {
				delete pendingTransactions[nowTimeStamp][transactionId];
				transactions[transactionId].status = REJECTED;
			}			
		})

	}
	

	// Helper time formater function
	const formatTimeStampNumber = num => num < 10 ? '0' + num : num;

	// Helper function that returns current time in UTC
	const getUtcNow = () => {
		let now = new Date();
		return new Date(now.getTime() + now.getTimezoneOffset() * 60000);
	}

	/**
	 * Helper function that creates time stamp from transaction time object. 
	 * 
	 * Time stamp is used to easily identify transaction from the current time. Instead of going trough all 
	 * the pending transactions, we can user current time convert it to time stamp and check if there is transaction
	 * that has the same time stamp, by checking the time stamp key on the pending transactions object. 
	 * 
	 * @param {Object} time Transaction time object
	 * @return {String} Unique string time stamp
	 */
	const generateTimeStamp = (time) => {
		if(!isValidDate(time)) {
			console.log('Time Stamp Error: Incorrect time format.');
			return false;
		}

		let timeStampYear = formatTimeStampNumber(time.getFullYear() - 2000);
		let timeStampMonth = formatTimeStampNumber(time.getMonth() + 1);
		let timeStampDay = formatTimeStampNumber(time.getDate());
		let timeStampHour = formatTimeStampNumber(time.getHours());
		let timeStampMinute = formatTimeStampNumber(time.getMinutes());

		return ( timeStampYear + '-' + timeStampMonth + '-' + timeStampDay + '-' + timeStampHour + '-' + timeStampMinute);		
	}

	/**
	 * Transaction pre check.
	 * 
	 * Checking if requested transaction is possible to execute. 
	 * 
	 * @param {Object} transaction
	 * @return {Boolean} Flag indicating whether transaction is possible or not
	 *  
	 */
	const validateTransaction = transaction => {
		
		if(!transaction) {
			console.log('Transaction Execution Error: Transaction is not provided.');
			return false;
		}

		let { amount, credit, debit, id } = transaction;

		if(!amount || !credit || !debit){
			console.log('Transaction Execution Error: Transaction parameters are not correct for transaction: ', id);
			return false;
		}

		if(isNaN(Number(amount))){
			console.log('Transaction Execution Error: Transaction amount is not a number for transaction: ', id);
			return false;
		}

		if(amount < 0) {
			console.log('Transaction Execution Error: Transaction amount is not correct for transaction: ', id);
			return false;
		}

		if(!accounts[credit] || !accounts[debit]) {
			console.log('Transaction Execution Error: Credit/Debit accounts are not available for transaction: ', id);
			return false;
		}


		if(accounts[credit].balance < 0) {
			console.log('Transaction Execution Error: Credit amount is negative for transaction: ', id);
			return false;
		}

		if(accounts[credit].balance - amount < 0) {
			console.log('Transaction Execution Error: Not enough funds in the credit account for transaction: ', id);
			return false;
		}

		return true;
	}

	/**
	 * Transaction execution. 
	 * 
	 * Executes transaction defined by transactionId
	 * @param {String} transactionId Unique transaction identifier
	 * @return {String} transaction status completed/rejected/error
	 */
	const executeTransaction = (transactionId) => {
		
		if(!transactionId) {
			console.log('Transaction Execution Error: No transaction id provided.');
			return ERROR;
		}

		if(!transactions[transactionId]){
			console.log('Transaction Execution Error: No transaction with provided id found.');
			return ERROR;
		}

		// Transfer funds
		let transaction = transactions[transactionId];
		let { amount, credit, debit, timeStamp } = transaction;
		
		if(!validateTransaction(transaction)){
			return ERROR;
		}
		
		// Updating balance
		accounts[credit].balance = accounts[credit].balance - amount;
		accounts[debit].balance = accounts[debit].balance + amount;
		
		// Making sure past transaction array does not hold the current transaction
		accounts[credit].pastTransactions = accounts[credit].pastTransactions.filter(id => id !== transactionId);
		accounts[debit].pastTransactions = accounts[credit].pastTransactions.filter(id => id !== transactionId);

		// Add current transaction to the past transactions array
		accounts[credit].pastTransactions.push(transactionId);
		accounts[debit].pastTransactions.push(transactionId);
		
		transaction.status = COMPLETED;

		delete pendingTransactions[transaction.timeStamp][transactionId];

		if(!completedTransactions[timeStamp]){
			completedTransactions[timeStamp] = {};
		}

		// Move current transaction from pending to completed transactions object
		console.log(`Transaction Completed: ${amount} transferred from account ${credit} to account ${debit}`);
		completedTransactions[timeStamp][transactionId] = transaction;
		
		return COMPLETED;

	}


	/**
	 * 
	 * Creating transaction record.
	 * 
	 * Whenever new transaction request comes we create a transaction record in the database. 
	 * Initial transaction record status is set to pending, until transaction is completed or rejected. When receiving 
	 * the request we are checking for the correct data formats, and then storing the transaction record to the transaction 
	 * object and to the database, and then scheduling the job, that will perform the transaction. 
	 *  
	 * @param {Object} newTransaction object. Object parameters: 
	 *  type: Transaction type, credit/refund
	 *  credit: Id of the credit account
	 *  debit: Id of the debit account
	 *  amount amount of funds to be transferred
	 *  transactionTime time of the transaction
	 * @return {String} New transaction id or 'error' if no transaction is created  
	 * 
	 */
	const addTransaction = (transaction) => {
		let { transactionTime, type, credit, debit, amount } = transaction;
		if(
			typeof transactionTime === 'undefined' ||
			typeof type === 'undefined' ||
			typeof credit === 'undefined' ||
			typeof debit === 'undefined' || 
			typeof amount === 'undefined'
		) {
			console.log('Transaction Management Error: Invalid number of parameters.');
			return ERROR;
		}

		if(!isValidDate(transactionTime)) {
			console.log('Transaction Management Error: Invalid transaction time format.');
			return ERROR;
		}

		if (allowedTransactionTypes.indexOf(type) === -1) {
			console.log('Transaction Management Error: Invalid transaction type.');
			return ERROR;
		}

		if(!accounts[credit] || !accounts[debit]){
			console.log('Transaction Management Error: Provided account doe\'s not exist.');
			return ERROR;
		}

		if(isNaN(Number(amount))){
			console.log('Transaction Management Error: Invalid transaction amount format');
			return ERROR;
		}

		// Check if transaction is in future
		let now = getUtcNow(); 
		
		if(now - transactionTime > 0) {
			console.log('Transaction Management Error: Request transaction time is in past');
			return ERROR;
		}

		let timeStamp = generateTimeStamp(transactionTime);

		if(!timeStamp){
			console.log('Transaction Management Error: Error while generating transaction timestamp for ', transactionTime);
			return ERROR;
		}
		// We have valid parameters. Now we are adding the transaction record to the pending transaction objects
		let newTransaction = {
			transactionTime,
			type,
			credit,
			debit, 
			id: uuidv1(),
			amount: Number(amount),
			status: PENDING,
			timeStamp
		};

		if(!pendingTransactions[newTransaction.timeStamp]){
			pendingTransactions[newTransaction.timeStamp] = {};
		}

		// Make sure we dont have this transaction already in the list
		pendingTransactions[newTransaction.timeStamp][newTransaction.id] = {...newTransaction};
		transactions[newTransaction.id] = {...newTransaction};
		// Check if the transaction time is now. 
		
		let nowTimeStamp = generateTimeStamp(now);
		
		//If it is now trigger the transaction job execution for the current minute
		if(nowTimeStamp === newTransaction.timeStamp) {
			executeScheduledJobs(now);
		}
		console.log(`Transaction Management: New transaction ${newTransaction.id} request received`);

		return newTransaction.id;
	}

	const getTransaction = transactionId => (transactions[transactionId] || 'No transaction with given id');

	const getAccountData = accountId => (accounts[accountId] || 'No account with given id');

	const getHistory = () => completedTransactions;

	
	return {
		init,
		addTransaction,
		executeTransaction,
		getTransaction,
		getAccountData,
		getHistory
	}
}; 