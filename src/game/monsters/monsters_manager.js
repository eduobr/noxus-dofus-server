const MonstersGroup = require("./monsters_group")
const Datacenter = require("../../database/datacenter")
class MonstersManager {

    static getMonsterTemplate(templateId) {
        var monsters = Datacenter.monsters;
        for(var m of monsters) {
            if(m._id == templateId) {
                return m;
            }
        }
        return null;
    }
}
module.exports = MonstersManager