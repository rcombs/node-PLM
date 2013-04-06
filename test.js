#! /usr/bin/env node
var PLM = require("./"),
	util = PLM.util,
	readline = require("readline");

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	completer: completer,
	terminal: true
});

var modem = new PLM(process.argv[2], function(data){
	console.log(
		"Connected to PLM\n" +
		"ID: " + util.makeHex(data.id) + "\n" +
		"Device Category: " + util.makeHex(data.deviceCategory) + "\n" +
		"Device Subcategory: " + util.makeHex(data.deviceSubcategory) + "\n" +
		"Firmware Version: " + util.makeHex(data.firmwareVersion)
	);
	rl.prompt();
});

modem.on("error", function(err){
	console.error(err.toString());
	rl.prompt();
});

function completer(line){
	return [[], ""];
}

var helpCmds = {
	sendCommand: "",
	sendDirect: ""
}

var commands = {
	sendCommand: function(){
		rl.pause();
		modem.sendCommand(util.parseHex(arguments), function(ACK, cmd, data){
			console.log("ACK:" + ACK + "; CMD:" + util.makeHex(cmd) + "; DATA: " + util.makeHex(data));
			rl.resume();
			rl.prompt();
		});
	},
	sendDirect: function(to, cmd, hops){
		rl.pause();
		modem.sendINSTEON({
			to: util.parseHex(to),
			command: util.parseHex(cmd),
			flags: {
				maxHops: parseInt(hops, 10)
			}
		}, function(err, reply){
			if(err){
				console.error(err);
			}else{
				console.log("REPLY FROM: " + reply.flags);
				console.log("COMMAND NUMBER: " + reply.command.number);
				console.log("COMMAND DATA: " + reply.command.data);
			}
			rl.resume();
			rl.prompt();
		});
	},
	help: function(command){
		if(command in helpCmds){
			console.log(helpCmds[command]);
			rl.prompt();
		}else{
			console.log("Available commands: " + Object.keys(helpCmds).sort().join(", "));
			rl.prompt();
		}
	}
};

rl.on("line", function(line){
	var args = line.split(" ");
	if(args[0] in commands){
		commands[args[0]].apply(this, args.slice(1));
	}else{
		console.error("Command not found: " + args[0] + ". Type `help` for a list.");
		rl.prompt();
	}
});