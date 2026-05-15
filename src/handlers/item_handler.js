const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const Formatter = require("../utils/formatter")
const DBManager = require("../database/dbmanager")
const Datacenter = require("../database/datacenter")
const ConfigManager = require("../utils/configmanager")
// Lazy require para romper ciclo: world → world_client → processor → handlers → world
function getWorldServer() { return require("../network/world"); }
const AuthServer = require("../network/auth")
const PlayableBreedEnum = require("../enums/playable_breed_enum")
const Character = require("../database/models/character")
const WorldManager = require("../managers/world_manager")
const CharacterManager = require("../managers/character_manager")
const Loader = require("../managers/loader_manager")
const FriendHandler = require("../handlers/friend_handler")
const CharacterItem = require("../database/models/character_item")
class ItemHandler {

    static handleObjectSetPositionMessage(client, packet) {
        var item = client.character.itemBag.getItemByID(packet.objectUID);
        if(item) {
            if(client.character.itemBag.hasSameItemOnPos(item, packet.position))
            {
                client.character.sendInventoryBag();
                return;
            }

            client.character.itemBag.createStack(item, packet.quantity, function(stack) {
                if(ItemHandler.checkPositionValidity(client, item, packet.quantity, packet.position)) {
                    var onPosItem = client.character.itemBag.moveItem(stack, packet.position);
                    if(onPosItem) {
                        client.send(new Messages.ObjectMovementMessage(onPosItem._id, onPosItem.position));
                    }
                    client.send(new Messages.ObjectMovementMessage(stack._id, stack.position));
                    CharacterManager.applyRegen(client.character);
                    client.character.statsManager.sendStats();
                    client.character.sendInventoryBag();
                    client.character.refreshLookOnMap();
                    client.character.itemBag.save();
                    Logger.debug("Item(id: " + stack._id + ") moved to position: " + packet.position);
                }
                else {
                    client.character.sendInventoryBag();
                    client.character.itemBag.save();
                    Logger.debug("Item(id: " + stack._id + ") can't be moved to position: " + packet.position);
                }
            });
        }
        else {
            client.send(new Messages.BasicNoOperationMessage());
        }
    }

    static checkPositionValidity(client, item, quantity, position) {
        if(client.character.level < item.getTemplate().level) {
            client.send(new Messages.ObjectErrorMessage(7)); // Level too low
            return false;
        }

        // Hat
        if(position != CharacterItem.DEFAULT_SLOT) {
            if(item.getTemplate().typeId == 16 && position != 6) {
                client.send(new Messages.ObjectErrorMessage(10)); // Can't equip here
                return false;
            }

            // Check twice equipment
            if(client.character.itemBag.hasAlreadyWearedItem(item.templateId)){
                client.send(new Messages.ObjectErrorMessage(2)); // Can't equip twice
                return false;
            }

            // Check double equip by quantity
            if(quantity != 1) {
                client.send(new Messages.ObjectErrorMessage(10)); // Can't equip here
                return false;
            }
        }

        return true;
    }

    static handleObjectDeleteMessage(client, packet) {
        var item = client.character.itemBag.getItemByID(packet.objectUID);
        if(item && packet.quantity > 0) {
            if(item.quantity >= packet.quantity) {
                item.quantity -= packet.quantity;
                if(item.quantity <= 0) { // Delete
                    client.character.itemBag.deleteItem(item);
                }
                else { // Refresh quantity
                    client.send(new Messages.ObjectQuantityMessage(item._id, item.quantity));
                }

                client.character.statsManager.sendStats();
                client.character.sendInventoryBag();
                client.character.refreshLookOnMap();
            }

            client.send(new Messages.BasicNoOperationMessage());
        }
        else {
            client.send(new Messages.BasicNoOperationMessage());
        }
    }
}
module.exports = ItemHandler