PLM is a Node.js library for bidirectional, event-rich communication with INSTEON PowerLinc USB and RS232 modems.  
This documentation is not yet complete, and some parts of the API are subject to change without notice. Check CHANGELOG.md before updating.

Quick Start
===========
This example is a heavily-simplified version of the PLMsh script whose source can be found at `test.js`.

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


Terms
=====
Below are some brief explanations of some of the terms used in this document.

"PLM"
-----
The term "PLM" usually refers to a USB or RS232 [SmartLabs PowerLinc Modem](http://www.smarthome.com/2413S/PowerLinc-Modem-INSTEON-Serial-Interface-Dual-Band/p.aspx "Link to SmartHome page"); however, to avoid confusion with this module's name, the term "PLM" is not used to refer to the modem in this document. Here, `PLM` will refer to this module itself and its main entry-point class.

"IM"/"Modem"
------------
"IM" and "Modem" in body text refer to an INSTEON modem this module is compatible with. `modem` in a code span refers to an instance of this module.

"Device"/"Responder"
--------------------
"Device" and "Responder" refer to an INSTEON or X10 device being controlled via an IM using this module. The IM itself will be referred to by the terms above.

"Host"
------
"Host" refers to the computer connected to an IM using either RS232 or USB.

Compatability
=============
This module should be compatible with all SmartLabs PowerLinc Modems. It may or may not be compatible with SmartLabs PowerLinc Controllers (pending testing).

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

Modem commands can leave off `STX (0x02)`
---------------------------------------
All actual raw serial commands to the modem start with `STX (0x02)`, but if you don't want to pass that in, `PLM` will add it for you. This applies to all direct-command functions (e.g. `modem.sendCommand`, `modem.sendCommandNow`), but not to `modem.sendRaw`.

Unless otherwise specified, too-short `Buffer`s may result in garbage data
--------------------------------------------------------------------------
Most functions do not check the lengths of the `Buffer`s they are passed, assuming that either your buffers are correct-length or you're OK with the consequences. If you pass in a `Buffer` with a length shorter than expected, `PLM` will not fill the remaining space with `0x00`, so the remainder of the field may be filled with garbage data that remains in memory. Only use too-short `Buffer`s if your command definitely doesn't parse data past a certain point; if you're unsure, use a correct-length `Buffer` and fill the remainder with `0x00` yourself.

API
===
This module contains multiple classes, each of which has a set of methods and properties. Below is an explanation of the usage of each.

Class: PLM
----------
The `PLM` class can be accessed using `require("plm")`. It's the root class for the entire library, and you connect to an INSTEON modem by instantiating it. These docs will assume that you call `var PLM = require("plm");`.

### Constructor
Calling `new PLM("/path/to/modem/devfs/entry", callback)` (NOTE: `PLM` will NOT attempt to auto-detect your modem's serialport. This may change in the future, but for now, assume it won't) will connect `PLM` to the modem using the `node-serialport` module. These docs will refer to a `PLM` instance as `modem`.  
Once it's connected, `PLM` will send your modem the command `GET_IM_INFO (0x60)`. The modem will reply with some information about itself, including its hardcoded INSTEON Device ID, its Device Category, its Device Subcategory, and its firmware version. An object containing these will be passed as the first argument to the `callback` function; we'll assume you called the arg `data`.  
`data.id` is a 3-byte `Buffer`. `data.deviceCategory`, `data.deviceSubcategory`, and `data.firmwareVersion` are `Number`s.  
Once the `callback` has been called, `PLM` is ready to send and receive INSTEON and X10 commands.

### `modem.busy`
This `Boolean` keeps track of whether or not the modem is currently busy with a command.  
DO NOT MODIFY THIS VALUE; this may result in unexpected behavior.  
You probably don't have to worry about this, as `modem.sendCommand` and `modem.dequeue` deal with it for you.

### `modem.queue`
This `Array` is the queue of commands to be sent to the modem.  
Each item is an `Object` with format `{command: Buffer([...command data...]), callback: function(error, replyData, commandNumber){}}`; the callback is optional, and will be called when the modem replies to the command or times out.  
You probably don't have to worry about this, as `modem.sendCommand` and `modem.dequeue` deal with it for you.

### `modem.INSTEONQueue`
This `Array` represents the INSTEON message queue. Elements are in the format `{message: INSTEONMessage({...message data...}), callback: function(error, message){}}`; the callback is optional, and will be called when the modem sends an error, the device replies, or the command times out.  
You probably don't have to worry about this, as `modem.sendINSTEON` and `modem.dequeue_INSTEON` deal with it for you.

### `modem.commandTimeout`
This `Number` represents the amount of time, in milliseconds, that `PLM` will wait for a response from a modem. `250` milliseconds is the default, as it's just above the amount of time after which the modem itself times out and clears its message buffer by default. If a response is not received after this time, your command's `callback`, if present, will be called with its first argument as `MODEM_TIMEOUT` `Error`. Note that receiving a timeout callback is not a perfect guarantee that the command failed, a timeout will result in an automatic dequeue, and if a command times out and later a reply is received, the callback will not fire again. Set this to `false` to disable modem timeouts (this may result in unexpected behavior).

### `modem.minCommandInterval`
This `Number` represents the minimum amount of time, in milliseconds, between the PLM acknowledging a previous command and the library advancing its queue and sending the next one. It defaults to `250`; this is rather arbitrary and is subject to change. A value of `0` disables this timer.

### `modem.INSTEONStandardTimeout`
This `Number` represents the amount of time, in milliseconds, that `PLM` will wait for a response to an INSTEON direct standard-length message. `2500` milliseconds is the default; this is rather arbitrary and subject to change. This timeout is only set if a `callback` is provided to `modem.sendINSTEON`. Note that receiving a timeout callback is not a perfect guarantee that the command failed, and if the device timeout occurs, and the reply is later received, the callback will not fire again. Set this to `false` to disable device timeouts (this may result in unexpected behavior).

### `modem.INSTEONExtendedTimeout`
This `Number` is identical to `modem.INSTEONStandardTimeout`, except that it's used for extended messages rather than standard-length ones. It defaults to `5000` milliseconds; this is rather arbitrary and subject to change.

### `modem.minINSTEONInterval`
This `Number` represents the minimum amount of time, in milliseconds, between receiving an `ACK`/`NAK` for an INSTEON command and the library advancing its queue and sending the next one. It defaults to `0`, which disables this timer.

### `modem.X10Timeout`
This `Number` is identical to `modem.INSTEONStandardTimeout`, except that it's used for X10 messages rather than INSTEON ones. Note that X10 is not currently implemented, so this value has no effect.

### `modem.sendINSTEON(message, callback)`
This method sends an INSTEON direct message from the modem. The message should be an `INSTEONMessage`. `callback` will be called when either the modem returns an error, the device replies, or either the modem or the device times out. The arguments are `callback(error, message)`, where `message` is the `INSTEONMessage` `ACK` sent by the device and `error` is either false (if the operation was successful) or one of `MODEM_NAK`, `MODEM_TIMEOUT`, `DEVICE_NAK`, or `DEVICE_TIMEOUT`. If the error is `DEVICE_NAK`, the `message` will still be provided. For other errors, `message` will be `undefined`.

### `modem.sendCommand(command, callback, jump)`
This method queues a command to be sent over the serial link to the modem, and tries to advance the queue. If the modem is busy with another command, this will return `false`, but the message will still be queued. If the `callback` arg is present, `callback(error, replyData, commandNumber)` will be called when the modem sends a reply. Arguments are:
- `error` is either `false` or an error (either `MODEM_NAK` or `MODEM_TIMEOUT`),
- `replyData` is a `Buffer` containing the modem's response data, not including the `STX`, command number, or `ACK/NAK` bytes.
- `commandNumber` is a `Number` which should match the first byte of your original `command`.
By default, `sendCommand` will `push` new commands on the end of the queue, but if your command is high-priority, you can set `jump` to `true`, and your command will be `unshift`ed onto the front of the queue.

### `modem.dequeue()`
This method attempts to send the first item in the command queue to the modem. If the modem is busy, this method will return `false`. If there are no items in the queue, it will return `undefined`. Otherwise, it will call `modem.sendCommandNow` with the first item in the queue, prepare event listeners and timeouts for the reply, remove the item, and return `true`. You shouldn't have to worry about calling this, as `PLM` calls it automatically.

### `modem.INSTEONDequeue()`
This method is identical to `modem.dequeue`, except that it advances the INSTEON queue, rather than the modem command queue.

### `modem.sendCommandNow(command, callback)`
This method prepends `STX (0x02)` to the `command` if necessary, then sends it directly to the modem using `modem.sendRaw`. The `callback` parameter will be passed to `modem.sendRaw`; it's only used to start timers internally, as it only fires when the command has been sent, not when a reply has been received.  
NOTE: YOU PROBABLY SHOULD NOT CALL THIS METHOD DIRECTLY. THE MODEM CANNOT HANDLE MULTIPLE CONCURRENT COMMANDS.  
The queue system keeps track of the modem's state and queues additional commands when the modem is busy. If a command is sent immediately without checking the modem's status, unexpected behavior may result. You have been warned.

### `modem.sendINSTEONNow(message, callback)`
This method generates a modem command `Buffer` from an `INSTEONMessage` and queues it to be sent to the modem without adding it to the INSTEON message queue. You most likely don't have to worry about this method, as `modem.INSTEONDequeue` calls it automatically. Incorrect use of this method will not cause modem errors, but may cause INSTEON messages to be dropped due to interference on the power line from other messages. `modem.sendINSTEON` is reccomended.

### `modem.sendRaw(data, callback)`
This method sends `data` directly to the modem without any preprocessing, queueing, or checking. `callback`, if present, will be called when the command has been sent (not when a reply has been received).  
NOTE: YOU PROBABLY SHOULD NOT CALL THIS METHOD DIRECTLY. THE MODEM CANNOT HANDLE MULTIPLE CONCURRENT COMMANDS. THE MODEM MAY NOT RESPOND CORRECTLY TO COMMANDS NOT BEGINNING WITH `STX (0x02)`.  
The queue system keeps track of the modem's state and queues additional commands when the modem is busy. If a command is sent immediately without checking the modem's status, unexpected behavior may result. You have been warned.

Class: `INSTEONMessage`
---------------------
`INSTEONMessage` represents a message sent or to be sent by an IM or other device over the INSTEON network. This class is available at `PLM.INSTEONMessage`, and inherits from `Buffer`.

### Constructor
Calling `new INSTEONMessage(data)` returns a new INSTEON message with the data specified. Data can be any of:
* A `Buffer` containing a pre-formatted INSTEON message for the IM, either for sending or receiving.
* An `Object` with compatible keys, including an existing `INSTEONMessage` instance.
This documentation will refer to an instance of `INSTEONMessage` as `message`.
An `INSTEONMessage`'s `Buffer` value can be used directly when sending a message to an IM, but will not match the content of a received message (the 3-byte "from" field is missing, deliberately). To compare two messages, use `message.isEqual`.

### Class method: `INSTEONMessage.isINSTEONMessage(message)`
This method returns a `Boolean` representing whether or not `message` is an `INSTEONMessage`.

### 

Class: `INSTEONMessageFlags`
----------------------------
`INSTEONMessageFlags` represents the flags byte of an `INSTEONMessage`. This class is available at `PLM.INSTEONMessageFlags`, and inherits from `Number`.

Class: `INSTEONMessageCommand`
------------------------------
`INSTEONMessageCommand` represents the command bytes of an `INSTEONMessage`. This class is available at `PLM.INSTEONMessageCommand`, and inherits from `Buffer`.

Class: util
-----------


Constants
---------
Various constants are available in `lib/constants.js`, which is exposed as `PLM.CONSTANTS`. Not every constant is individually documented, but most should be self-explanatory.

### `MIN_OUT_COMMAND` (`0x60`)
All modem command numbers `>=` this constant are sent from the host machine to the modem. It's most likely only useful internally.

### `ACK` (`0x02`)
The first byte in any message to or from an IM must be `STX (0x02)`.

### `ACK` (`0x06`)
The `ACK` byte is used to signify that a command was successful.

### `NAK` (`0x15`)
The `NAK` byte is sent in place of `ACK` when a command fails.

### `PLM_COMMANDS`
This object contains each IM command's command number that can be sent to or received from an IM. For instance, `PLM_COMMANDS.INSTEON_STD_RECV == 0x50`.

### `CMD_LEN`
This object contains the number of bytes each IM command can be expected to contain, by command number, with the exception of `0x62` (`SEND_INSTEON`), whose length varies depending on if the message being sent is standard- or extended-length. It's most likely only useful internally. For instance, `CMD_LEN[0x50] == 9`.

### `INSTEON_COMMANDS`
This object contains the standard set of INSTEON commands, sorted first by type (`DIRECT`, `GROUP`, or `BROADCAST`), then by length (`STD` or `EXT`). For instance, `INSTEON_COMMANDS.DIRECT.STD.LIGHT_ON == 0x11`. `INSTEON_COMMANDS.DIRECT.EXT` is currently empty due to a case of lazy; pull requests are appreciated. Any inaccuracies or addition requests should be submitted to the Github issues page for this module.

### `BUTTON_EVENTS`
This object contains the event code for each of the button events an IM could send via command `0x54` (`BUTTON_EVENT_REPORT`). For instance, `BUTTON_EVENTS.SET_HELD == 0x03`.

TODO
====
- Add timeouts with sensible defaults
- Add a metric ton of convenience functions
- Finish documentation (esp. of subclasses)
