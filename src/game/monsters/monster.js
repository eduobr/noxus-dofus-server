const LookManager = require("../../managers/look_manager")
const Types = require("../../io/dofus/types")
const Messages = require("../../io/dofus/messages")
class Monster {

    constructor(template, grade) {
        this.template = template;
        this.grade = grade;
    }

    getEntityLook() {
       return LookManager.parseLook(this.template.look).toEntityLook();
    }

    getLightInformations() {
        return new Types.MonsterInGroupLightInformations(this.template._id, this.grade.grade);
    }

    getMonsterInGroupInformations() {
        if (this.grade) {
            return new Types.MonsterInGroupInformations(this.template._id, this.grade.grade, this.getEntityLook());
        }
    }
}
module.exports = Monster