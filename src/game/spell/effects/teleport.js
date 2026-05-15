const Basic = require("../../../utils/basic")
class Teleport {

    static effectId = 4;

    static process(data) {
        data.caster.sequenceCount++;
        //TODO: Check cell validity
        data.caster.teleport(data.cellId);
    }
}

module.exports = Teleport;