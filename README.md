PLM is a Node.js library for bidirectional, event-rich communication with INSTEON PowerLinc USB and RS232 modems.  
This documentation is not yet complete, and some parts of the API are subject to change without notice. Check CHANGELOG.md before updating.

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

General tips
============
In the `PLM` API, many methods support multiple input types to make it easier to use the library with various different coding styles. There are also a few things that you need to keep in mind when working with binary data. Here are some general rules that should apply across the entire library:

`Buffer`s can be `Array`s
-------------------------
Any time you can pass a `Buffer` into a function, you can pass an `Array` of bytes as `Number`s instead, as `PLM` will call `new Buffer(argument)`.

`INSTEONMessage`s can be `Array`s, `Buffer`s, or compatible `Object`
--------------------------------------------------------------------
Any time you can pass an `INSTEONMessage` into a function, you can pass a `Buffer`, `Array` of bytes, or `Object` with compatible keys, as `PLM` will call `new INSTEONMessage(argument)`.

`INSTEONMessageFlags` can be a `Number`, 1-byte `Buffer` or `Array`, or compatible `Object`
-------------------------------------------------------------------------------------------
Any time you can pass an `INSTEONMessageFlags` into a function, you can pass a `Number` representing a bitmask, a 1-byte `Array` or `Buffer`, or an `Object` with compatible keys, as `PLM` will call `new INSTEONMessageFlags(argument)`.

INSTEON `command`s can be `Buffer`s or `Object`s or `Number`s
-------------------------------------------------------------
In `modem.sendINSTEON(message, callback)`, `message.command` can be any of 3 types:
- A `Buffer` containing the command 1 and command 2 fields. A 1-byte `Buffer` will result in `0x00` in command 2
- An `Object` in the format `{number: 0x11, data: 0xFF}`, `command.number` corresponding to the command 1 field and `command.data` corresponding to command 2 and defaulting to `0x00`
- A `Number` representing the Command 1 field; Command 2 will be `0x00`

PLM commands can leave off `STX (0x02)`
---------------------------------------
All actual raw serial commands to the modem start with `STX (0x02)`, but if you don't want to pass that in, `PLM` will add it for you. This applies to all direct-command functions (e.g. `modem.sendCommand`, `modem.sendCommandNow`), but not to `modem.sendRaw`.

Unless otherwise specified, too-short `Buffer`s may result in garbage data
--------------------------------------------------------------------------
Most functions do not check the lengths of the `Buffer`s they are passed, assuming that either your buffers are correct-length or you're OK with the consequences. If you pass in a `Buffer` with a length shorter than expected, `PLM` will not fill the remaining space with `0x00`, so the remainder of the field may be filled with garbage data that remains in memory. Only use too-short `Buffer`s if your command definitely doesn't parse data past a certain point; if you're unsure, use a correct-length `Buffer` and fill the remainder with `0x00` yourself.

API
===

Class: PLM
----------
The `PLM` class can be accessed using `require("plm")`. It's the root class for the entire library, and you connect to an INSTEON modem by instantiating it. These docs will assume that you call `var PLM = require("plm");`.  
Calling `new PLM("/dev/usbTTY0", callback)` (or wherever the serial port is [NOTE: `PLM` will NOT attempt to auto-detect your modem's serialport. This may change in the future, but for now, assume it won't]) will connect to the modem using the `serialport` module. These docs will assume that you call `var modem = new PLM(path, callback)`.  
Once it's connected, `PLM` will send your modem the command `GET_IM_INFO (0x60)`. The modem will reply with some information about itself, including its hardcoded INSTEON ID, its Device Category, its Device Subcategory, and its firmware version. An object containing these will be passed as the first argument to the `callback` function; we'll assume you called the arg `data`.  
`data.id` is a 3-byte `Buffer`. `data.deviceCategory`, `data.deviceSubcategory`, and `data.firmwareVersion` are `Number`s.  
Once the `callback` has been called, `PLM` is ready to send and receive INSTEON and X10 commands.

`modem.busy`
------------
This `Boolean` keeps track of whether or not the modem is currently busy with a command.  
DO NOT MODIFY THIS VALUE; this may result in unexpected behavior.  
You probably don't have to worry about this, as `modem.sendCommand` and `modem.dequeue` deal with it for you.

`modem.queue`
-------------
This `Array` is the queue of commands to be sent to the modem.  
Each item is an `Object` with format `{command: Buffer([...command data...]), callback: function(){}}`; the callback is optional, and will be called when the modem replies to the command.  
You probably don't have to worry about this, as `modem.sendCommand` and `modem.dequeue` deal with it for you.

`modem.commandTimeout`
----------------------
This `Number` represents the amount of time, in milliseconds, that `PLM` will wait for a response from a modem. `250` milliseconds is the default, as it's just above the amount of time after which the modem itself times out and clears its message buffer by default. If a response is not received after this time, your command's `callback`, if present, will be called with its first argument as `MODEM_TIMEOUT` `Error`. Note that receiving a timeout callback is not a perfect guarantee that the command failed, a timeout will result in an automatic dequeue, and if a command times out and later a reply is received, the callback will not fire again. Set this to `false` to disable modem timeouts (this may result in unexpected behavior).

`modem.INSTEONTimeout`
----------------------
This `Number` represents the amount of time, in milliseconds, that `PLM` will wait for a response to an INSTEON direct message. `2000` milliseconds is the default; this is rather arbitrary and subject to change. This timeout is only set if a `callback` is provided to `modem.sendINSTEON`. Note that receiving a timeout callback is not a perfect guarantee that the command failed, and if the device timeout occurs, and the reply is later received, the callback will not fire again. Set this to `false` to disable device timeouts (this may result in unexpected behavior).

`modem.X10Timeout`
------------------
This `Number` is identical to `modem.INSTEONTimeout`, except that it's used for X10 messages rather than INSTEON ones.

`modem.sendINSTEON(message, callback)`
-------------------
This method sends an INSTEON direct message from the modem. The message should be an `INSTEONMessage`. `callback` will be called when either the modem returns an error, the device replies, or either the modem or the device times out. The arguments are `callback(error, message)`, where `message` is the `INSTEONMessage` `ACK` sent by the device and `error` is either false (if the operation was successful) or one of `MODEM_NAK`, `MODEM_TIMEOUT`, `DEVICE_NAK`, or `DEVICE_TIMEOUT`. If the error is `DEVICE_NAK`, the `message` will still be provided. For other errors, `message` will be `undefined`.

`modem.sendCommand(command, callback, jump)`
--------------------------------------
This method queues a command to be sent over the serial link to the modem, and tries to advance the queue. If the modem is busy with another command, this will return `false`, but the message will still be queued. If the `callback` arg is present, `callback(error, replyData, commandNumber)` will be called when the modem sends a reply. Arguments are:
- `error` is either `false` or an error (either `MODEM_NAK` or `MODEM_TIMEOUT`),
- `replyData` is a `Buffer` containing the modem's response data, not including the `STX`, command number, or `ACK/NAK` bytes.
- `commandNumber` is a `Number` which should match the first byte of your original `command`.
By default, `sendCommand` will `push` new commands on the end of the queue, but if your command is high-priority, you can set `jump` to `true`, and your command will be `unshift`ed onto the front of the queue.

`modem.dequeue()`
-----------------
This method attempts to send the first item in the command queue to the modem. If the modem is busy, this method will return `false`. Otherwise, it will call `modem.sendCommandNow` with the first item in the queue, prepare event listeners and timeouts for the reply, remove the item, and return `true`.

`modem.sendCommandNow(command, callback)`
-----------------------------------------
This method prepends `STX (0x02)` to the `command` if necessary, then sends it directly to the modem using `modem.sendRaw`. The `callback` parameter will be passed to `modem.sendRaw`; it's only used to start timers internally, as it only fires when the command has been sent, not when a reply has been received.  
NOTE: YOU PROBABLY SHOULD NOT CALL THIS METHOD DIRECTLY. THE MODEM CANNOT HANDLE MULTIPLE CONCURRENT COMMANDS.  
The queue system keeps track of the modem's state and queues additional commands when the modem is busy. If a command is sent immediately without checking the modem's status, unexpected behavior may result. You have been warned.

`modem.sendRaw(data, callback)`
---------------
This method sends `data` directly to the modem without any preprocessing, queueing, or checking. `callback`, if present, will be called when the command has been sent (not when a reply has been received).  
NOTE: YOU PROBABLY SHOULD NOT CALL THIS METHOD DIRECTLY. THE MODEM CANNOT HANDLE MULTIPLE CONCURRENT COMMANDS. THE MODEM MAY NOT RESPOND CORRECTLY TO COMMANDS NOT BEGINNING WITH `STX (0x02)`.  
The queue system keeps track of the modem's state and queues additional commands when the modem is busy. If a command is sent immediately without checking the modem's status, unexpected behavior may result. You have been warned.

TODO
====
- Add timeouts with sensible defaults
- Add a metric ton of convenience functions
- Finish documentation (esp. of subclasses)
