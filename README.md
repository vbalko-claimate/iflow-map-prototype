# iFlow Map UI5 Prototype (Issue #92)

Standalone SAPUI5 prototype for iFlow connection map visualization.

## What is included
- Nodes = iFlows
- Edges = IFlowConnection relationships
- Edge color coding by type:
  - `PROCESS_DIRECT` (blue)
  - `JMS` (green)
  - `DATA_STORE` (orange)
- Node click: simulated navigation hint to iFlow detail
- Edge click: detail popup (`type`, `from`, `to`, `notes`)
- Impact analysis: pick an iFlow and highlight directly + transitively connected subgraph

## Data source
- Local mocked data only (`webapp/model/mockData.json`)
- Shape follows backend contracts from `OwnersService.getIFlowConnections` and iFlow identifiers (`id`, `version`)

## Run locally
```bash
cd "/Users/vladimirbalko/development/ai/CL APPS/CLINTMANAGE/IFLOW_MAP_UI5_PROTOTYPE"
npm install
npm start
```

This opens `index.html` via UI5 Tooling local server.
