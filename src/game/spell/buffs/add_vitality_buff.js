const Buff = require("../buff")
const Messages = require("../../../io/dofus/messages")
const Types = require("../../../io/dofus/types")
class AddVitalityBuff extends Buff {

    static displayId = 125;

    constructor(delta, spell, spellLevel, effect, caster, fighter) {
        super(effect, spell, spellLevel, caster, fighter);
        this.delta = delta;
    }

    apply() {
        this.fighter.fightStatsBonus[11] += this.delta;
        this.fighter.current.life += this.delta;
    }

    unapply() {
        this.fighter.fightStatsBonus[11] -= this.delta;
        this.fighter.current.life -= this.delta;
        this.fighter.refreshStats();
        this.fighter.checkIfIsDead();
    }

    show() {
        this.fighter.fight.send(new Messages.GameActionFightDispellableEffectMessage(AddVitalityBuff.displayId, this.caster.id, this.getAbstractFightDispellableEffect()));
    }

    getAbstractFightDispellableEffect() {
        return new Types.FightTemporaryBoostEffect(this.id, this.fighter.id, this.duration, 1, this.spell.spellId, AddVitalityBuff.displayId, 16, this.delta);
    }
}

module.exports = AddVitalityBuff