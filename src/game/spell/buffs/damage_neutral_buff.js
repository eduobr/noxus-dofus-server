const Buff = require("../buff")
const Messages = require("../../../io/dofus/messages")
const Types = require("../../../io/dofus/types")
const Basic = require("../../../utils/basic")
class DamageNeutralBuff extends Buff {

    static displayId = 133;

    constructor(data, spell, spellLevel, effect, caster, fighter) {
        super(effect, spell, spellLevel, caster, fighter);
        this.data = data;
    }

    beginTurn()
    {
        this.fighter.takeDamage(this.data.caster, this.fighter.getDamage(this.data, 10), 10);
    }

    apply() {
    }

    unapply() {
        this.fighter.refreshStats();
        this.fighter.checkIfIsDead();
    }

    show() {
        this.fighter.fight.send(new Messages.GameActionFightDispellableEffectMessage(this.effectId, this.caster.id, this.getAbstractFightDispellableEffect()));
    }

    getAbstractFightDispellableEffect() {
        return new Types.FightTemporaryBoostEffect(this.id, this.fighter.id, this.duration, 1, this.spell.spellId, this.effectId, 16, this.data.effect.diceNum);
    }

}

module.exports = DamageNeutralBuff