Welcome to ØNDER documentation!
================================

.. toctree::
   :maxdepth: 3
   :caption: Contents:

======
ØNDER
======
ØNDER is a commonwealth cryptoeconomic platform for the energy sector. A full description of the platform can be found on our website_.
This repository is a monorepo, including core components, commonwealth services and numerous developer tools.

.. _website: https://onder.tech

=========
Packages
=========

+---------------------------------------------------------+-----------------------------------------------------------+
| Package                                                 | Description                                               |
+=========================================================+===========================================================+
| [metering-kit-node](packages/metering-kit-node)         | Virtualised metering node                                 | 
+---------------------------------------------------------+-----------------------------------------------------------+
| [metering-kit-hardware](packages/metering-kit-hardware) | Hardware meter, sends data to a virtualised metering node |
+---------------------------------------------------------+-----------------------------------------------------------+
| [generator-node](./packages/generator-node)             | Energy seller node                                        | 
+---------------------------------------------------------+-----------------------------------------------------------+ 
| [frontend](./packages/frontend)                         | Dashboard for the nodes                                   | 
+---------------------------------------------------------+-----------------------------------------------------------+
| [archiver](./packages/archiver)                         | Gather historical information from the nodes              | 
+---------------------------------------------------------+-----------------------------------------------------------+
| [common](./packages/common)                             | Common code shared by all the packages                    | 
+---------------------------------------------------------+-----------------------------------------------------------+


====================
Install with Docker
====================
Pre install. You must have: **Docker**, **.env** file

* Copy `.env.example` to project root as `.env`
* Run `docker-compose build` to build docker images
* Run `docker-compose up` to start backend and frontend in dev mode
* `docker-compose exec SERVICE bash` (SERVICE is frontend, seller etc.) to access bash (or anything else) inside service container

========
Install
========
Pre install. You mast have: node v8.11.3,  yarn, xsltproc

* `yarn global add lerna node-gyp node-pre-gyp  xsltproc`
* `yarn install`
* run command from packages/metering-kit-node:
    `ACCOUNT=123 ACCOUNT_PASSWORD=olOlo INSTANCE=ONDER DEBUG=* UPSTREAMADDRESS=http://localhost:3000 ETHEREUM_API=http://localhost:8545 GATEWAY_URL=http://localhost:3000 DB_CONNECTION=sqlite://./NodeDatabase.db NODE_ENV=production WEB_INTERFACE_PORT=8001 node dist/main.js`

==============
Configuration
==============

Configs for counter_

.. _counter: https://www.notion.so/onder/Manufacturing-6cbeddfec69344a497495e9c5dbee026#54e25d5c06644b4d88634f13d2a75330

Configs for VM_

.. _VM: https://www.notion.so/onder/Run-VM-locally-44bf1eced24f406fa207ef0110fff0441

===================
Indices and tables
===================

.. |date| date:: %d.%m.%Y

Текущая дата |date|

* :ref:`genindex`
* :ref:`search`
