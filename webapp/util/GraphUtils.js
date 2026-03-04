sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
  "use strict";

  var COLOR_MAP = {
    PROCESS_DIRECT: "#0a6ed1",
    JMS:            "#1e8e3e",
    DATA_STORE:     "#c05b00"
  };

  var MUTED_COLOR = "#d5dadd";
  var IMPACT_COLOR = "#0057a3";

  /**
   * Build adjacency-friendly graph structure from raw mockData.
   * Returns { nodes:[], edges:[], nodeMap:{}, iflowOptions:[] }
   */
  function buildGraphStructure(oRaw) {
    var aIflows = oRaw.iflows || [];
    var aConnections = oRaw.connections || [];

    var aNodes = aIflows.map(function (f) {
      return {
        key: f.id + "::" + f.version,
        id: f.id,
        version: f.version,
        name: f.name,
        runtimeStatus: f.runtimeStatus,
        packageId: f.packageId,
        label: f.name
      };
    });

    var nodeMap = {};
    aNodes.forEach(function (n) { nodeMap[n.key] = n; });

    var aEdges = aConnections.map(function (c) {
      return {
        id: c.connectionId,
        source: c.sourceIflowId + "::" + c.sourceIflowVersion,
        target: c.targetIflowId + "::" + c.targetIflowVersion,
        connectionType: c.connectionType,
        notes: c.notes || "",
        color: COLOR_MAP[c.connectionType] || "#999"
      };
    });

    var aOptions = aNodes.map(function (n) {
      return { key: n.key, text: n.name + " (" + n.id + " v" + n.version + ")" };
    });

    return { nodes: aNodes, edges: aEdges, nodeMap: nodeMap, iflowOptions: aOptions };
  }

  /**
   * BFS impact analysis from a start key.
   * Returns a Set-like object (plain map) of visited node keys.
   */
  function bfsImpact(aNodes, aEdges, sStartKey) {
    var mAdj = Object.create(null);
    aNodes.forEach(function (n) { mAdj[n.key] = []; });
    aEdges.forEach(function (e) {
      if (mAdj[e.source]) { mAdj[e.source].push(e.target); }
      if (mAdj[e.target]) { mAdj[e.target].push(e.source); }
    });

    var visited = Object.create(null);
    var queue = [sStartKey];
    visited[sStartKey] = true;

    while (queue.length) {
      var current = queue.shift();
      (mAdj[current] || []).forEach(function (k) {
        if (!visited[k]) {
          visited[k] = true;
          queue.push(k);
        }
      });
    }
    return visited;
  }

  /**
   * Load an external script via <script> tag, returning a Promise that
   * resolves when the global is available.
   */
  function loadScript(sUrl, sGlobalName) {
    return new Promise(function (resolve, reject) {
      if (sGlobalName && window[sGlobalName]) {
        resolve(window[sGlobalName]);
        return;
      }
      var el = document.createElement("script");
      el.src = sUrl;
      el.async = true;
      el.onload = function () {
        resolve(sGlobalName ? window[sGlobalName] : true);
      };
      el.onerror = function () {
        reject(new Error("Failed to load script: " + sUrl));
      };
      document.head.appendChild(el);
    });
  }

  function showNodeDetail(oNodeData) {
    MessageToast.show(
      oNodeData.name + " (" + oNodeData.id + " v" + oNodeData.version + ") - " + oNodeData.runtimeStatus
    );
  }

  function showEdgeDetail(oEdgeData) {
    var sDetails = [
      "Type: " + oEdgeData.connectionType,
      "From: " + oEdgeData.source,
      "To: " + oEdgeData.target,
      "Notes: " + (oEdgeData.notes || "-")
    ].join("\n");
    MessageBox.information(sDetails, { title: "Connection Detail" });
  }

  return {
    COLOR_MAP: COLOR_MAP,
    MUTED_COLOR: MUTED_COLOR,
    IMPACT_COLOR: IMPACT_COLOR,
    buildGraphStructure: buildGraphStructure,
    bfsImpact: bfsImpact,
    loadScript: loadScript,
    showNodeDetail: showNodeDetail,
    showEdgeDetail: showEdgeDetail
  };
});
