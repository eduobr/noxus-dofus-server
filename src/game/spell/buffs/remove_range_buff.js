const Buff = require("../buff")
const Messages = require("../../../io/dofus/messages")
const Types = require("../../../io/dofus/types")
class RemoveRangeBuff extends Buff {

    static displayId = 133;

    constructor(delta, spell, spellLevel, effect, caster, fighter) {
        super(effect, spell, spellLevel, caster, fighter);
        this.delta = delta;
    }

    apply() {
        this.fighter.fightStatsBonus[19] -= this.delta;
        this.fighter.refreshStats();
    }

    unapply() {
        this.fighter.fightStatsBonus[19] += this.delta;
        this.fighter.refreshStats();
        this.fighter.checkIfIsDead();
    }

    show() {
        this.fighter.fight.send(new Messages.GameActionFightDispellableEffectMessage(116, this.caster.id, this.getAbstractFightDispellableEffect()));
    }

    getAbstractFightDispellableEffect() {
        return new Types.FightTemporaryBoostEffect(this.id, this.fighter.id, this.duration, 1, this.spell.spellId, 116, 16, this.delta);
    }

}

module.exports = RemoveRangeBuff