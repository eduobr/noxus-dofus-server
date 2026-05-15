const NpcDialog = require("../../dialog/npc_dialog")
class NpcTalk{
    
    action = 3;

    static execute(character,npc){
        var npc = new NpcDialog(character,npc);
        npc.open();
    }
}
module.exports = NpcTalk