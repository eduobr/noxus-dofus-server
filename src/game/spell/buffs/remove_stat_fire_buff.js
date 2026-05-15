const Buff = require("../buff")
const Messages = require("../../../io/dofus/messages")
const Types = require("../../../io/dofus/types")
class RemoveStatFireBuff extends Buff {

    static displayId = 125;

    constructor(delta, spell, spellLevel, effect, caster, fighter) {
        super(effect, spell, spellLevel, caster, fighter);
        this.delta = delta;
    }

    apply() {
        this.fighter.fightStatsBonus[15] -= this.delta;
    }

    unapply() {
        this.fighter.fightStatsBonus[15] += this.delta;
        this.fighter.refreshStats();
        this.fighter.checkIfIsDead();
    }

    show() {
        //this.fighter.fight.send(new Messages.GameActionFightDispellableEffectMessage(this.effectId, this.caster.id, this.getAbstractFightDispellableEffect()));
    }

    getAbstractFightDispellableEffect() {
        return new Types.FightTemporaryBoostEffect(this.id, this.fighter.id, this.duration, 1, this.spell.spellId, this.effectId, 16, this.delta);
    }
}

module.exports = RemoveStatFireBuff