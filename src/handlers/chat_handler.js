const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const Formatter = require("../utils/formatter")
const DBManager = require("../database/dbmanager")
const ConfigManager = require("../utils/configmanager")
// Lazy require para romper ciclo: world → world_client → processor → handlers → world
function getWorldServer() { return require("../network/world"); }
const AuthServer = require("../network/auth")
const ChatChannel = require("../enums/chat_activable_channels_enum")
const Character = require("../database/models/character")
const CommandManager = require("../managers/command_manager")
const IgnoredHandler = require("../handlers/ignored_handler")
const AccountRoleEnum = require("../enums/account_role_enum")
class ChatHandler {


    static escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    static handleChatClientPrivateMessage(client, packet)
    {
        if (packet.content.length > 256)
            return;
        if (packet.receiver == client.character.name)
        {
            client.character.replyText("Le message n'a pas été envoyé : vous vous parlez à vous-même...");
            return;
        }
        
        var time = Date.now || function() {return +new Date;};
        var clientTarget = getWorldServer().getOnlineClientByCharacterName(packet.receiver);
        if (clientTarget)
        {
            if (client.account.role < AccountRoleEnum.ADMINISTRATOR)
                packet.content = ChatHandler.escapeHtml(packet.content);
            if (client.character.canSendMessage()) {
                if (!IgnoredHandler.isIgnoringForSession(clientTarget, client.character) && !IgnoredHandler.isIgnoring(clientTarget, client.account)) {
                    client.send(new Messages.ChatServerCopyMessage(ChatChannel.PSEUDO_CHANNEL_PRIVATE, packet.content, time(), clientTarget.character.name, clientTarget.character._id, clientTarget.character.name));
                    clientTarget.send(new Messages.ChatServerMessage(ChatChannel.PSEUDO_CHANNEL_PRIVATE, packet.content, time(), clientTarget.character.name, client.character._id, client.character.name, client.account.uid));
                    client.character.updateLastMessage();
                }
                else
                {
                    client.character.replyLangsMessage(1, 370, [clientTarget.character.name]);
                }
            }
        }
        else
            client.character.replyText("Le message n'a pas pu être envoyé : le destinataire est introuvable.");
    }

    static handleChatClientMultiMessage(client, packet)
    {
        if (packet.content.length > 256)
            return;
        if (client.account.role < AccountRoleEnum.ADMINISTRATOR)
            packet.content = ChatHandler.escapeHtml(packet.content);
        if (client.character.canSendMessage())
        {
            var time = Date.now || function() {return +new Date;};
            switch (packet.channel)
            {

                case ChatChannel.CHANNEL_GLOBAL:
                    if (packet.content[0] != '.')
                    {

                        var map = client.character.getMap();
                        if (map)
                        {
                            if (client.character.isInFight())
                                client.character.fight.send(new Messages.ChatServerMessage(ChatChannel.CHANNEL_GLOBAL, packet.content, time(), client.character.name, client.character._id, client.character.name, client.account.uid));
                            else
                                map.send(new Messages.ChatServerMessage(ChatChannel.CHANNEL_GLOBAL, packet.content, time(), client.character.name, client.character._id, client.character.name, client.account.uid));
                        }
                    }
                    else
                    {
                        CommandManager.manageCommand(packet.content.substr(1), client);
                    }
                break;

                case ChatChannel.CHANNEL_SALES:
                    if (client.character.canSendSalesMessage())
                    {
                        getWorldServer().sendToAllOnlineClients(new Messages.ChatServerMessage(ChatChannel.CHANNEL_SALES, packet.content, time(), client.character.name, client.character._id, client.character.name, client.account.uid));
                        client.character.updateLastSalesMessage();
                    }
                break;

                case ChatChannel.CHANNEL_SEEK:
                    if (client.character.canSendSeekMessage())
                    {
                        getWorldServer().sendToAllOnlineClients(new Messages.ChatServerMessage(ChatChannel.CHANNEL_SEEK, packet.content, time(), client.character.name, client.character._id, client.character.name, client.account.uid));
                        client.character.updateLastSeekMessage();
                    }
                break;

                case ChatChannel.CHANNEL_PARTY:
                        if (client.character.party) {
                            client.character.party.sendToParty(new Messages.ChatServerMessage(ChatChannel.CHANNEL_PARTY, packet.content, time(), client.character.name, client.character._id, client.character.name, client.account.uid));
                        }
                    break;
            }
            client.character.updateLastMessage();
        }
    }
}
module.exports = ChatHandler