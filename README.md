services:
  - type: web
    name: agenda-futbolistas
    runtime: python
    plan: starter
    buildCommand: ""
    startCommand: python3 server.py
    healthCheckPath: /healthz
    envVars:
      - key: DB_PATH
        value: /var/data/players.db
    disk:
      name: agenda-data
      mountPath: /var/data
      sizeGB: 1
