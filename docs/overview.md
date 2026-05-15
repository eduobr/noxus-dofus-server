# Noxus — Project Overview

## Propósito

Noxus es un emulador de servidor privado para **Dofus 2.39**, el MMORPG táctico
por turnos de Ankama. Permite ejecutar un servidor de juego independiente al que
los clientes oficiales de Dofus pueden conectarse.

## Estado del proyecto

- **Versión original**: Alpha v1.1
- **Estado actual**: funcional en Node 25 + pnpm
- **Última actividad original detectada**: Noviembre 2016
- **Autores originales**: Yuki, Arkalius, Yamisaaf
- **Revival / migración 2026**: Hermes + eduobr
- **Repositorio original**: Azure DevOps (`nightwolfdev.visualstudio.com`)

## Stack principal

| Componente      | Tecnología                        |
|-----------------|-----------------------------------|
| Lenguaje        | JavaScript                        |
| Módulos         | CommonJS (`require` / `module.exports`) |
| Transpilador    | Ninguno — Babel fue eliminado     |
| Runtime         | Node.js 25.3.0                    |
| Package manager | pnpm 11.1.2                       |
| Base de datos   | MongoDB 8.0 en Docker             |
| Driver MongoDB  | `mongodb` 6.x                     |
| Serialización   | Binario manual (BigEndian + VarInt) |
| Protocolo       | Dofus 2.39 (protocol ID 1738)     |
| Pathfinding     | Dijkstra / lógica propia          |
| Testing         | Cliente TCP de prueba (`client-test.js`), sin suite automatizada |
| CI/CD           | No implementado                   |

## Módulos principales

| Módulo               | Ruta              | Responsabilidad                              |
|----------------------|-------------------|----------------------------------------------|
| App entry point      | `src/app.js`      | Orquestación de arranque                     |
| Auth Server          | `src/network/`    | Servidor TCP de autenticación (puerto 443)   |
| World Server         | `src/network/`    | Servidor TCP de mundo (puerto 5556)          |
| Protocol Messages    | `src/io/dofus/`   | Serialización del protocolo Dofus 2.39       |
| Handlers             | `src/handlers/`   | Manejadores de mensajes por dominio          |
| Game Logic           | `src/game/`       | Combate, hechizos, pathfinding, NPCs, grupos |
| Database             | `src/database/`   | Acceso a MongoDB + carga de datos en RAM     |
| Data Extraction      | `tools/`          | Lectura de archivos .d2o/.d2i del cliente    |
| Game Data            | `db/`             | Datos de juego en JSON (importables a MongoDB) |

## Migración moderna

La rama `main` actual ya no usa el runtime original Node 8 + Babel. La migración
realizada en 2026 dejó el servidor ejecutándose directamente desde `src/` con
Node 25 y pnpm:

- Se eliminaron `.babelrc`, `compilation.sh` y `dist/`.
- Los imports ES6 se convirtieron a CommonJS.
- `mongodb` se actualizó a 6.x manteniendo callbacks públicos en `DBManager`
  para minimizar cambios en handlers y managers.
- Los ciclos CommonJS se resolvieron con lazy `require` en módulos críticos.
- La validación funcional llega a `GameContextCreateMessage` con `client-test.js`.

## Lo que es código propio

Todo el código en `src/` es original del equipo Noxus, con adaptaciones de
compatibilidad modernas. Esto incluye:

- La lógica completa de servidor (auth, world, handlers)
- El sistema de combate por turnos (~900 líneas en `fight.js`)
- El motor de hechizos, buffs y efectos (~80 archivos)
- El pathfinding hexagonal (Dijkstra + algoritmo Dofus1Line)
- El sistema de NPCs, diálogos y comercio
- El sistema de grupos e intercambios

## Lo que depende de Ankama

- **El protocolo de red**: los `messageId` y la estructura de mensajes son
  ingeniería inversa del protocolo propietario de Dofus 2.39. Si Ankama cambia
  su protocolo, este servidor deja de funcionar con clientes actualizados.
- **El cliente**: el archivo `patch/DofusInvoker.swf` es un launcher de Ankama
  modificado para apuntar a este servidor. Requiere el cliente Dofus 2.39
  completo fuera del repositorio.
- **Los datos de juego**: los archivos `.d2o` en `tools/Noxus-D2OReader/data/`
  son extraídos del cliente oficial de Ankama.
- **Las reglas y fórmulas**: replican el comportamiento del juego oficial para
  mantener compatibilidad con el cliente.

## Lo que es personalizable

Prácticamente todo excepto el protocolo de red y el formato de datos:

- Puertos, IPs, mensajes de bienvenida (`config.json`)
- Razas disponibles, nivel inicial, kamas iniciales
- Cooldowns de canales de chat
- Stats de items, razas, hechizos (editando los JSON en `db/`)
- Diálogos de NPCs, nuevos NPCs
- Sistema de combate, efectos de hechizos (requiere programación)
- Tablas de experiencia
- Comandos de administrador
