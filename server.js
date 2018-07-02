"use strict";

const express = require("express");
const app = express();
const http = require('http').Server(app);

const bodyParser = require('body-parser');
const cors = require('cors');

const PORT = process.env.npm_package_config_port || '3233';


app.use(bodyParser.json());
app.set('trust proxy', 1);

app.post('/requestTransfer', (req, res) => {
	let { year, month, day, hour, minutes, amount, type, credit, debit } = req.body;

	let transactionTime = new Date(year + '-' + month + '-' + day + 'T' + hour + ':' + minutes + ':' + '00');

	let newTransaction = {
		transactionTime,
		type,
		credit,
		debit,
		amount
	};

	let newTransactionId = fundsTransfer.addTransaction(newTransaction);

	res.send(`New transaction request received ${newTransactionId}`);
});

app.get('/transaction/:id', (req, res) => {
	res.send(fundsTransfer.getTransaction(req.params.id));
});

app.get('/account/:id', (req, res) => {
	res.send(fundsTransfer.getAccountData(req.params.id));
});

app.get('/history', (req, res) => {
	res.send(fundsTransfer.getHistory());
});

const fundsTransfer = require('./lib/fundsTransfer')();

fundsTransfer.init();

http.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});

