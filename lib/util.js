var util = module.exports = {
	makeBitmask: function(arr){
		var nMask = 0, nFlag = 0, nLen = arr.length > 32 ? 32 : arr.length;
		for (nFlag; nFlag < nLen; nMask |= arr[nFlag] << nFlag++);
		return nMask;
	},
	parseBitmask: function(nMask){
		// nMask must be between -2147483648 and 2147483647
		if (nMask > 0x7fffffff || nMask < -0x80000000) {
			throw new TypeError("arrayFromMask - out of range");
		}
		for (var nShifted = nMask, aFromMask = []; nShifted; aFromMask.push(Boolean(nShifted & 1)), nShifted >>>= 1);
		return aFromMask;
	},
	makeMessageFlags: function(flags){
		var out = util.makeBitmask([flags.extended, flags.ACK || flags.NAK, flags.group, flags.broadcast || flags.NAK]) << 4;
		
		if(!("hopsLeft" in flags)){
			flags.hopsLeft = flags.maxHops = flags.maxHops || 0;
		}
		
		out |= (flags.hopsLeft << 2) | flags.maxHops;
		
		return out;
	},
	parseMessageFlags: function(flags){
		var arr = util.parseBitmask(flags);
		return {
			broadcast: (arr[7] && !(arr[6] || arr[5])),
			group: arr[6],
			ACK: (arr[5]), // NOTE: ACK field is either ACK or NAK!
			NAK: (arr[5] &&  arr[7]),
			extended: arr[4],
			hopsLeft: makeBitmask(arr.slice(2, 2)),
			maxHops: makeBitmask(arr.slice(0, 2))
		};
	},
	makeINSTEONMsg: function(msg){
		var extended = "userData" in msg;
		
		var buf = new Buffer(extended ? 20 : 6);
		
		var flags = (typeof msg.flags == "number") ? msg.flags : util.makeMessageFlags(msg.flags);
		var parsedFlags = (typeof msg.flags == "object") ? msg.flags : util.parseMessageFlags(msg.flags);
		
		if(msg.to){
			(new Buffer(msg.to)).copy(buf, 0);
		}else if(parsedFlags.broadcast){
			var devType = msg.deviceCategory | 0;
			devType <<= 12;
			devType |= msg.deviceDescriptor;
			buf.writeUInt16BE(devType, 0);
			buf[2] = msg.firmwareRevision | 0;
		}else if(parsedFlags.group){
			buf.fill(0, 0, 2);
			buf[2] = msg.group;
		}
		buf[3] = flags;
		// We support 2 types of input for commands:
		// `commandNumber` and `commandData` map to the command 1 and command 2 fields (simple)
		// `command` is an Array or Buffer containing both (standard)
		if(msg.commandNumber){
			buf[4] = msg.commandNumber;
			buf[5] = msg.commandData || 0;
		}else{
			(new Buffer(msg.command)).copy(buf, 4);
		}
		if(extended){
			(new Buffer(msg.userData)).copy(buf, 6);
		}
		
		return buf;
	},
	parseINSTEONMsg: function(buf){
		var flags = util.parseMessageFlags(buf[6]);
		if(flags.group){
			return {
				from: buf.slice(0, 3),
				flags: flags,
				group: buf[5],
				command: buf.slice(7, 9),
				commandNumber: buf[7],
				commandData: buf[8],
				userData: (buf.length > 8) ? buf.slice(9) : undefined
			};
		}else if(flags.broadcast){
			var devType = buf.readUInt16BE(3);
			return {
				from: buf.slice(0, 3),
				flags: flags,
				deviceCategory: devType >>> 12, // High 4 bits
				deviceDescriptor: devType & 0xFFF, // Low 12 bits
				firmwareRevision: buf[5],
				command: buf.slice(7, 9),
				commandNumber: buf[7],
				commandData: buf[8],
				userData: (buf.length > 8) ? buf.slice(9) : undefined
			};
		}else{
			return {
				from: buf.slice(0, 3),
				to: buf.slice(3, 6),
				flags: flags,
				command: buf.slice(7, 9),
				commandNumber: buf[7],
				commandData: buf[8],
				userData: (buf.length > 8) ? buf.slice(9) : undefined
			};
		}
	},
	parseHex: function(hex){
		return new Buffer(hex.replace(/$ *0x/, "").replace(/[^0-9A-F]/gi, ""), "hex");
	},
	makeHex: function(buffer, separator){
		if(typeof buffer == "number"){
			buffer = new Buffer([buffer]);
		}
		if(separator === undefined){
			separator = ".";
		}else if(!separator){
			if(buffer.length == 1){
				separator = " 0x";
			}
		}
		var str = "";
		for(var i = 0; i < buffer.length; i++){
			str += separator + buffer.toString("hex", i, i + 1);
		}
		return str.slice(1); // Kill the first separator
	}
};