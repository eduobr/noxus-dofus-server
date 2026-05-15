const Buff = require("../buff")
const Messages = require("../../../io/dofus/messages")
const Types = require("../../../io/dofus/types")
class AddState extends Buff {

    static displayId = 950;

    constructor(delta, spell, spellLevel, effect, caster, fighter) {
        super(effect, spell, spellLevel, caster, fighter);
        this.delta = delta;
    }

    apply() { }

    unapply() { }

    show() {
        this.fighter.fight.send(new Messages.GameActionFightDispellableEffectMessage(AddState.displayId, this.caster.id, this.getAbstractFightDispellableEffect()));
    }

    hide() {
        this.fighter.fight.send(new Messages.GameActionFightDispellSpellMessage(951, this.fighter.id, this.fighter.id, this.spell.spellId));
    }

    getAbstractFightDispellableEffect() {
        return new Types.FightTemporaryBoostStateEffect(this.id, this.fighter.id, this.duration, 1, this.spell.spellId, this.effectId, 16, 0, this.delta);
    }

}

module.exports = AddState