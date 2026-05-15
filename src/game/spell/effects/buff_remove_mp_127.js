const Basic = require("../../../utils/basic")
class BuffRemoveMP {

    static effectId = 127;

    static process(data) {
        for(var t of data.targets) {
            var roll = 0;
            roll = (data.effect.diceSide > 0) ? Basic.getRandomInt(data.effect.diceNum, data.effect.diceSide) : data.effect.diceNum;
                t.looseMP(data, roll);
        }
    }
}

module.exports = BuffRemoveMP;