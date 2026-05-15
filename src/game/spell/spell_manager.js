const Datacenter = require("../../database/datacenter")
const Basic = require("../../utils/basic")
const Logger = require("../../io/logger")
class SpellManager {

    static getSpell(spellId) {
        for(var s of Datacenter.spells) {
            if(s._id == spellId) return s;
        }
        return null;
    }

    static getSpellLevelById(id) {
        for(var s of Datacenter.spellsLevels) {
            if(s._id == id) return s;
        }
        return null;
    }

    static getSpellLevel(spellId, spellGrade) {
        for(var s of Datacenter.spellsLevels) {
            if(s.spellId == spellId && s.grade == spellGrade) return s;
        }
        return null;
    }

    // Spell effect helpers

}
module.exports = SpellManager