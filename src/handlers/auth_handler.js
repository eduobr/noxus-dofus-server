const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const Formatter = require("../utils/formatter")
const DBManager = require("../database/dbmanager")
const ConfigManager = require("../utils/configmanager")
// Lazy requires para romper ciclo: auth → auth_client → processor → auth_handler → auth
function getWorldServer() { return require("../network/world"); }
function getAuthServer() { return require("../network/auth"); }
class AuthHandler {

    static sendDisconnectMessage(client)
    {
        client.send(new Messages.SystemMessageDisplayMessage(true, 61, ["La connexion a été interrompu par une nouvelle connexion."]));
    }

    static disconnectAlreadyConnectedClient(accountId)
    {
        var authClients = getAuthServer().getAllClients();
        var worldClients = getWorldServer().getAllClients();
        for (var client in authClients)
        {
            if (authClients[client].account != null && authClients[client].account.uid == accountId)
            {
                AuthHandler.sendDisconnectMessage(authClients[client]);
                authClients[client].close();
            }
        }

        for (var client in worldClients)
        {
            if (worldClients[client].account != null && worldClients[client].account.uid == accountId)
            {
                AuthHandler.sendDisconnectMessage(worldClients[client]);
                worldClients[client].close();
            }
        }

    }

    static handleIdentificationMessage(client, packet) {
        Logger.debug("Request identification from client (version=" + JSON.stringify(packet.version) + ")");
        // Read credentials
        //var buffer = new IO.CustomDataWrapper(Formatter.toArrayBuffer(packet.credentials));
        var credentials = {
            username: packet.lang.split('@')[0],
            password: packet.lang.split('@')[1],
        }
        Logger.debug("Credentials requested : " + JSON.stringify(credentials));
        DBManager.findAccount(credentials.username, function(account) {
            if(account == null) { // Can't find account
                Logger.error("Can't find the account '" + credentials.username + "'");
                client.send(new Messages.IdentificationFailedMessage(2));
                return; 
            }
            if(account.password != credentials.password) { // Password
                client.send(new Messages.IdentificationFailedMessage(2));
                return;
            }
            if(account.locked == 1) { // Banned
                client.send(new Messages.IdentificationFailedMessage(3));
                return;
            }
            AuthHandler.disconnectAlreadyConnectedClient(account.uid);
            /*var dateStarted = new Date() / 1000;
            var dateEnd = dateStarted.add(30).day();*/
            client.account = account;
            client.send(new Messages.IdentificationSuccessMessage(account.username, account.nickname, account.uid, 0, true, account.secret_question, 0, 1, 0, 0, 5));
            Logger.infos("Player '" + account.username + "' logged");
            AuthHandler.sendServersList(client);
        });
    }

    static sendServersList(client) {
        DBManager.getCharacters({accountId: client.account.uid}, function(characters){
            var servers = new Array();
            servers.push(new Types.GameServerInformations(ConfigManager.configData.server_id, 1, 3, 0, true, characters.length, 1));
            client.send(new Messages.ServersListMessage(servers, 0, true));
        })
    }

    static handleServerSelectionMessage(client, packet)
    {
        client.send(new Messages.SelectedServerDataMessage(packet.serverId, ConfigManager.configData.host, ConfigManager.configData.world_port, true, getAuthServer().generateTicket(client)));
        client.close();
    }
}
module.exports = AuthHandler