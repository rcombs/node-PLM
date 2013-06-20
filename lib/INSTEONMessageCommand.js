var INSTEONMessageCommand = module.exports = function INSTEONMessageCommand(cmd){
	if(!(this instanceof INSTEONMessageCommand)){ 
		return new INSTEONMessageCommand(cmd);
	}
	Buffer.call(this, 2);
	if(typeof cmd == "number"){
		this[0] = cmd;
		this[1] = 0;
	}else if(Buffer.isBuffer(cmd) || Array.isArray(cmd)){
		this[0] = cmd[0] || 0;
		this[1] = cmd[1] || 0;
	}else if(typeof cmd == "object"){
		this[0] = cmd.number || 0;
		this[1] = cmd.data || 0;
	}else{
		this[0] = this[1] = 0;
	}
};

INSTEONMessageCommand.prototype = new Buffer(0);
Object.defineProperties(INSTEONMessageCommand.prototype, {
	number: {
		get: function(){
			return this[0];
		},
		set: function(value){
			return this[0] = value;
		}
	},
	data: {
		get: function(){
			return this[1];
		},
		set: function(value){
			return this[1] = value;
		}
	}
});
