const Buff = require("../buff")
const Messages = require("../../../io/dofus/messages")
const Types = require("../../../io/dofus/types")
const InvisbilityStateEnum = require("../../../enums/invisibility_state_enum")
class InvisiblityBuff extends Buff {

    static displayId = 133;

    constructor(data, spell, spellLevel, effect, caster, fighter) {
        super(effect, spell, spellLevel, caster, fighter);
        this.data = data;
    }

    beginTurn()
    {
        if (this.fighter.invisibilityState != InvisbilityStateEnum.INVISIBLE)
            this.unapply();
    }

    apply() {
        this.fighter.invisibilityState = InvisbilityStateEnum.INVISIBLE;
        this.fighter.updateInvisibility(this.effectId);
    }

    unapply() {
        this.fighter.invisibilityState = InvisbilityStateEnum.VISIBLE;
        this.fighter.updateInvisibility(this.effectId);

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

module.exports = InvisiblityBuff