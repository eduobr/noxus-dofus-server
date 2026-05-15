const Buff = require("../buff")
const Messages = require("../../../io/dofus/messages")
const Types = require("../../../io/dofus/types")
class AddSwapDamage extends Buff {

    static displayId = 1164;

    constructor(spell, spellLevel, effect, caster, fighter) {
        super(effect, spell, spellLevel, caster, fighter);
    }

    apply() {

     this.fighter.isSwapDamage = 1;   
     }

    unapply() {
        this.fighter.isSwapDamage = 0;
     }

    show() {
        this.fighter.fight.send(new Messages.GameActionFightDispellableEffectMessage(AddSwapDamage.displayId, this.caster.id, this.getAbstractFightDispellableEffect()));
    }

    hide() {
        //this.fighter.fight.send(new Messages.GameActionFightDispellSpellMessage(951, this.fighter.id, this.fighter.id, this.spell.spellId));
    }

    getAbstractFightDispellableEffect() {
        return new Types.FightTemporaryBoostStateEffect(this.id, this.fighter.id, this.duration, 1, this.spell.spellId, this.effectId, 16, 0, 0);
    }

}

module.exports = AddSwapDamage