OK, I swear I'll actually document this. It's complicated, and definitely needs it, but actually writing and testing it takes priority at the moment.

As of v0.1.0, most things are tested and work.

Basic Use
=========

	var PLM = require("plm");
	
	var modem = new PLM("/dev/ttyUSB0", function(data){
		// Called when the modem is ready;
		// data contains the modem's device info
		console.log(
			"Connected to PLM\n" +
			"ID: " + PLM.util.makeHex(data.id) + "\n" +
			"Device Category: " + PLM.util.makeHex(data.deviceCategory) + "\n" +
			"Device Subcategory: " + PLM.util.makeHex(data.deviceSubcategory) + "\n" +
			"Firmware Version: " + PLM.util.makeHex(data.firmwareVersion)
		);
		// Send an INSTEON command
		modem.sendINSTEON({
			to: PLM.util.parseHex("AB.CD.EF"), // Device ID, separator optional
			command: util.parseHex("11FF", 2) // INSTEON command (Light on at full)
		}, function(err, reply){
			if(err){
				console.error(err); // Something's wrong!
			}else{
				console.log("REPLY FROM: " + PLM.util.makeHex(reply.from)); // "AB.CD.EF"
				console.log("COMMAND NUMBER: " + PLM.util.makeHex(reply.command.number)); // "0x11"
				console.log("COMMAND DATA: " + PLM.util.makeHex(reply.command.data)); // "0xFF"
			}
		});
	});

TODO
====
- Add timeouts with sensible defaults
- Add a metric ton of convenience functions
- Write documentation
