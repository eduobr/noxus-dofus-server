const ShopDialog = require("../../dialog/shop_dialog")
class NpcBuySell{
    
    action = 1;

    static execute(character,npc){
        var npc = new ShopDialog(character,npc);
        npc.open();
    }
}
module.exports = NpcBuySell