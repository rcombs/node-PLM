#! /usr/bin/env node
var PLM = require("./"),
	readline = require("readline");

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	completer: completer,
	terminal: true
});

var modem = new PLM(process.argv[2], function(data){
	rl.write(
		"Connected to PLM.\n" +
		"ID: " + PLM.util.makeHex(data.id) + "\n" +
		"Device Category: " + PLM.util.makeHex(data.deviceCategory) + "\n" +
		"Device Subcategory: " + PLM.util.makeHex(data.deviceSubcategory) + "\n" +
		"Firmware Version: " + PLM.util.makeHex(data.firmwareVersion) + "\n"
	);
	rl.prompt();
});

modem.on("error", function(data){
	rl.write(data.toString() + "\n");
	rl.prompt();
});

function completer(line){
	return [[], ""];
}

var commands = {
	sendCommand: function(hex){
		modem.sendCommand(new Buffer(hex, "hex"), function(ACK, cmd, data){
			rl.write("ACK:" + ACK + "; CMD:" + cmd + "; DATA: " + data);
			rl.prompt();
		});
	},
	sendDirect: function(to, cmd, hops){
		modem.sendINSTEON({
			to: new Buffer(to, "hex"),
			cmd: new Buffer(cmd, "hex"),
			flags: {
				hops: parseInt(hops, 10)
			}
		}, function(response){
			rl.write(JSON.stringify(response));
			rl.prompt();
		});
	}
};

rl.on("line", function(line){
	var args = line.split(" ");
	if(args[0] in commands){
		commands[args[0]].apply(this, args.slice(1));
	}else{
		rl.write("Command not found: " + args[0] + ". Type `help` for a list.");
		rl.prompt();
	}
});