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

  var NODE_TYPE_COLORS = {
    iflow:           "#d9e7f7",
    contact:         "#e8f5e9",
    partner:         "#fff3e0",
    partnerChannel:  "#fce4ec",
    bizObject:       "#f3e5f5",
    bizCapability:   "#e8eaf6",
    certificate:     "#fff8e1"
  };

  var EDGE_TYPE_COLORS = {
    PROCESS_DIRECT:      "#0a6ed1",
    JMS:                 "#1e8e3e",
    DATA_STORE:          "#c05b00",
    CONTACT_ASSIGNMENT:  "#43a047",
    OBJECT_ASSIGNMENT:   "#7b1fa2",
    PARTNER_OWNS_CHANNEL:"#e65100"
  };

  /**
   * Build adjacency-friendly graph structure from raw mockData (connection mode).
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
   * Build full context graph from raw mockData.
   * Every entity type becomes a node, edges include iFlow connections +
   * contactAssignments + iflowObjectAssignments + partner→channel.
   * Returns { nodes:[], edges:[], nodeMap:{}, iflowOptions:[] }
   */
  function buildContextGraphStructure(oRaw) {
    var aNodes = [];
    var aEdges = [];
    var nodeMap = {};

    // Helper to build iFlow key matching connection mode
    function iflowKey(f) { return f.id + "::" + f.version; }
    // Lookup map: iflow.id → iflow key (for assignments that reference by id)
    var iflowIdToKey = {};

    // 1) iFlow nodes
    (oRaw.iflows || []).forEach(function (f) {
      var key = iflowKey(f);
      iflowIdToKey[f.id] = key;
      var node = {
        key: key,
        id: f.id,
        version: f.version,
        name: f.name,
        runtimeStatus: f.runtimeStatus,
        packageId: f.packageId,
        label: f.name,
        nodeType: "iflow"
      };
      aNodes.push(node);
      nodeMap[key] = node;
    });

    // 2) Contact nodes
    (oRaw.contacts || []).forEach(function (c) {
      var key = "contact::" + c.id;
      var node = {
        key: key,
        id: c.id,
        name: c.firstName + " " + c.lastName,
        label: c.firstName + " " + c.lastName,
        company: c.company,
        email: c.email,
        nodeType: "contact"
      };
      aNodes.push(node);
      nodeMap[key] = node;
    });

    // 3) Partner nodes
    (oRaw.partners || []).forEach(function (p) {
      var key = "partner::" + p.id;
      var node = {
        key: key,
        id: p.id,
        name: p.name,
        label: p.name,
        partnerType: p.type,
        nodeType: "partner"
      };
      aNodes.push(node);
      nodeMap[key] = node;
    });

    // 4) Partner Channel nodes
    (oRaw.partnerChannels || []).forEach(function (ch) {
      var key = "channel::" + ch.id;
      var node = {
        key: key,
        id: ch.id,
        name: ch.name,
        label: ch.name,
        protocol: ch.protocol,
        direction: ch.direction,
        partnerId: ch.partnerId,
        nodeType: "partnerChannel"
      };
      aNodes.push(node);
      nodeMap[key] = node;

      // Edge: partner → channel
      aEdges.push({
        id: "pch-" + ch.partnerId + "-" + ch.id,
        source: "partner::" + ch.partnerId,
        target: key,
        edgeType: "PARTNER_OWNS_CHANNEL",
        connectionType: "PARTNER_OWNS_CHANNEL",
        color: EDGE_TYPE_COLORS.PARTNER_OWNS_CHANNEL,
        notes: ch.protocol + " " + ch.direction
      });
    });

    // 5) Business Object nodes
    (oRaw.businessObjects || []).forEach(function (bo) {
      var key = "bizObj::" + bo.id;
      var node = {
        key: key,
        id: bo.id,
        name: bo.name,
        label: bo.name,
        nodeType: "bizObject"
      };
      aNodes.push(node);
      nodeMap[key] = node;
    });

    // 6) Business Capability nodes
    (oRaw.businessCapabilities || []).forEach(function (bc) {
      var key = "bizCap::" + bc.id;
      var node = {
        key: key,
        id: bc.id,
        name: bc.name,
        label: bc.name,
        nodeType: "bizCapability"
      };
      aNodes.push(node);
      nodeMap[key] = node;
    });

    // 7) Certificate nodes
    (oRaw.certificates || []).forEach(function (cert) {
      var key = "cert::" + cert.id;
      var node = {
        key: key,
        id: cert.id,
        name: cert.cn,
        label: cert.cn,
        certStatus: cert.status,
        expiresAt: cert.expiresAt,
        nodeType: "certificate"
      };
      aNodes.push(node);
      nodeMap[key] = node;
    });

    // 8) iFlow connection edges
    (oRaw.connections || []).forEach(function (c) {
      aEdges.push({
        id: c.connectionId,
        source: c.sourceIflowId + "::" + c.sourceIflowVersion,
        target: c.targetIflowId + "::" + c.targetIflowVersion,
        connectionType: c.connectionType,
        edgeType: c.connectionType,
        notes: c.notes || "",
        color: COLOR_MAP[c.connectionType] || "#999"
      });
    });

    // Build role lookup
    var roleMap = {};
    (oRaw.contactRoles || []).forEach(function (r) { roleMap[r.id] = r.name; });

    // 9) Contact assignment edges
    (oRaw.contactAssignments || []).forEach(function (ca) {
      var contactKey = "contact::" + ca.contactId;
      var targetKey;
      if (ca.objectType === "iflow") {
        targetKey = iflowIdToKey[ca.objectId];
      } else if (ca.objectType === "partnerChannel") {
        targetKey = "channel::" + ca.objectId;
      }
      if (contactKey && targetKey && nodeMap[contactKey] && nodeMap[targetKey]) {
        aEdges.push({
          id: "ca-" + ca.id,
          source: contactKey,
          target: targetKey,
          edgeType: "CONTACT_ASSIGNMENT",
          connectionType: "CONTACT_ASSIGNMENT",
          color: EDGE_TYPE_COLORS.CONTACT_ASSIGNMENT,
          notes: roleMap[ca.roleId] || ca.roleId
        });
      }
    });

    // 10) iFlow object assignment edges
    (oRaw.iflowObjectAssignments || []).forEach(function (oa) {
      var iflowNodeKey = iflowIdToKey[oa.iflowId];
      var targetKey;
      if (oa.objectType === "businessObject") {
        targetKey = "bizObj::" + oa.objectId;
      } else if (oa.objectType === "businessCapability") {
        targetKey = "bizCap::" + oa.objectId;
      } else if (oa.objectType === "partnerChannel") {
        targetKey = "channel::" + oa.objectId;
      }
      if (iflowNodeKey && targetKey && nodeMap[iflowNodeKey] && nodeMap[targetKey]) {
        aEdges.push({
          id: "oa-" + oa.id,
          source: iflowNodeKey,
          target: targetKey,
          edgeType: "OBJECT_ASSIGNMENT",
          connectionType: "OBJECT_ASSIGNMENT",
          color: EDGE_TYPE_COLORS.OBJECT_ASSIGNMENT,
          notes: oa.objectType
        });
      }
    });

    // Build iflow-only options for select dropdowns
    var aOptions = [];
    (oRaw.iflows || []).forEach(function (f) {
      var key = iflowKey(f);
      aOptions.push({ key: key, text: f.name + " (" + f.id + " v" + f.version + ")" });
    });

    return { nodes: aNodes, edges: aEdges, nodeMap: nodeMap, iflowOptions: aOptions };
  }

  /**
   * Check which iFlows are missing required ownership roles.
   * Returns array of { iflowKey, iflowName, missingRoles: string[] }
   */
  function checkMissingOwnership(oRaw) {
    var requiredRoles = ["R01", "R02"]; // Business Owner, IT Owner
    var roleMap = {};
    (oRaw.contactRoles || []).forEach(function (r) { roleMap[r.id] = r.name; });

    // Build map: iflowId → set of assigned roleIds
    var iflowRoles = {};
    (oRaw.contactAssignments || []).forEach(function (ca) {
      if (ca.objectType === "iflow") {
        if (!iflowRoles[ca.objectId]) { iflowRoles[ca.objectId] = {}; }
        iflowRoles[ca.objectId][ca.roleId] = true;
      }
    });

    var aResults = [];
    (oRaw.iflows || []).forEach(function (f) {
      var assigned = iflowRoles[f.id] || {};
      var missing = [];
      requiredRoles.forEach(function (rId) {
        if (!assigned[rId]) {
          missing.push(roleMap[rId] || rId);
        }
      });
      if (missing.length > 0) {
        aResults.push({
          iflowKey: f.id + "::" + f.version,
          iflowId: f.id,
          iflowName: f.name,
          missingRoles: missing
        });
      }
    });
    return aResults;
  }

  /**
   * BFS impact analysis from a start key.
   * @param {string} sDirection - "downstream" (source->target), "upstream" (target->source)
   * Returns a Set-like object (plain map) of visited node keys.
   */
  function bfsImpact(aNodes, aEdges, sStartKey, sDirection) {
    var mAdj = Object.create(null);
    aNodes.forEach(function (n) { mAdj[n.key] = []; });
    aEdges.forEach(function (e) {
      if (sDirection === "upstream") {
        if (mAdj[e.target]) { mAdj[e.target].push(e.source); }
      } else {
        if (mAdj[e.source]) { mAdj[e.source].push(e.target); }
      }
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

  /**
   * Extract unique package IDs from raw data.
   * Returns array of { key, text } for Select binding, with "ALL" first.
   */
  function getPackages(oRaw) {
    var mPkgs = {};
    (oRaw.iflows || []).forEach(function (f) {
      if (f.packageId && !mPkgs[f.packageId]) {
        mPkgs[f.packageId] = true;
      }
    });
    var aResult = [{ key: "ALL", text: "All Packages" }];
    Object.keys(mPkgs).sort().forEach(function (p) {
      aResult.push({ key: p, text: p });
    });
    return aResult;
  }

  /**
   * Filter graph data by packageId.
   * Primary iFlow nodes match the selected package. Connected iFlows from
   * other packages are kept but marked with _isExternal=true so controllers
   * can dim them visually. In context mode, non-iflow entities connected to
   * primary iFlows are also kept. Edges are kept when at least one endpoint
   * is a primary node.
   * @param {object} graphData - { nodes, edges, nodeMap, iflowOptions }
   * @param {string} sPackageId - package to filter by, or "ALL"/""
   * @returns {object} filtered copy of graphData (nodes get _isExternal flag)
   */
  function filterGraphByPackage(graphData, sPackageId) {
    if (!sPackageId || sPackageId === "ALL") {
      // Clear any stale _isExternal flags
      var cleanNodes = graphData.nodes.map(function (n) {
        if (n._isExternal) {
          var copy = Object.assign({}, n);
          copy._isExternal = false;
          return copy;
        }
        return n;
      });
      return { nodes: cleanNodes, edges: graphData.edges, nodeMap: graphData.nodeMap, iflowOptions: graphData.iflowOptions };
    }

    // Step 1: identify primary iFlow keys (matching package)
    var primaryKeys = {};
    graphData.nodes.forEach(function (n) {
      if (n.nodeType === "iflow" || !n.nodeType) {
        if (n.packageId === sPackageId) {
          primaryKeys[n.key] = true;
        }
      }
    });

    // Step 2: find connected iFlow keys from other packages (external)
    var externalKeys = {};
    graphData.edges.forEach(function (e) {
      if (primaryKeys[e.source] && !primaryKeys[e.target]) {
        externalKeys[e.target] = true;
      }
      if (primaryKeys[e.target] && !primaryKeys[e.source]) {
        externalKeys[e.source] = true;
      }
    });

    // Step 3: for context mode, find non-iflow nodes connected to primary iFlows
    var visibleKeys = {};
    Object.keys(primaryKeys).forEach(function (k) { visibleKeys[k] = true; });
    Object.keys(externalKeys).forEach(function (k) { visibleKeys[k] = true; });

    var hasContextNodes = graphData.nodes.some(function (n) { return n.nodeType && n.nodeType !== "iflow"; });
    if (hasContextNodes) {
      graphData.edges.forEach(function (e) {
        if (primaryKeys[e.source]) { visibleKeys[e.target] = true; }
        if (primaryKeys[e.target]) { visibleKeys[e.source] = true; }
      });
      // Include partner nodes if any of their channels are visible
      graphData.edges.forEach(function (e) {
        if (e.edgeType === "PARTNER_OWNS_CHANNEL") {
          if (visibleKeys[e.target]) { visibleKeys[e.source] = true; }
          if (visibleKeys[e.source]) { visibleKeys[e.target] = true; }
        }
      });
    }

    // Step 4: build nodes with _isExternal flag
    var aNodes = [];
    graphData.nodes.forEach(function (n) {
      if (!visibleKeys[n.key]) { return; }
      var copy = Object.assign({}, n);
      // External = iFlow from another package, connected to a primary node
      copy._isExternal = !primaryKeys[n.key] && (n.nodeType === "iflow" || !n.nodeType);
      aNodes.push(copy);
    });

    // Step 5: keep edges where at least one endpoint is primary
    var aEdges = graphData.edges.filter(function (e) {
      return visibleKeys[e.source] && visibleKeys[e.target];
    });

    // Step 6: rebuild nodeMap and iflowOptions (only primary in dropdown)
    var nodeMap = {};
    aNodes.forEach(function (n) { nodeMap[n.key] = n; });

    var aOptions = graphData.iflowOptions.filter(function (o) {
      return primaryKeys[o.key];
    });

    return { nodes: aNodes, edges: aEdges, nodeMap: nodeMap, iflowOptions: aOptions };
  }

  /**
   * Filter graph data by deployment status (runtimeStatus).
   * @param {object} graphData - { nodes, edges, nodeMap, iflowOptions }
   * @param {string} sFilter - "ALL", "STARTED", or "NOT_DEPLOYED"
   * @returns {object} filtered copy of graphData
   */
  function filterGraphByDeployment(graphData, sFilter) {
    if (!sFilter || sFilter === "ALL") { return graphData; }

    var visibleKeys = {};
    graphData.nodes.forEach(function (n) {
      // Non-iflow nodes (contacts, partners, etc.) always pass through
      if (n.nodeType && n.nodeType !== "iflow") {
        visibleKeys[n.key] = true;
      } else if (n.runtimeStatus === sFilter) {
        visibleKeys[n.key] = true;
      }
    });

    var aNodes = graphData.nodes.filter(function (n) { return visibleKeys[n.key]; });
    var aEdges = graphData.edges.filter(function (e) {
      return visibleKeys[e.source] && visibleKeys[e.target];
    });
    var nodeMap = {};
    aNodes.forEach(function (n) { nodeMap[n.key] = n; });
    var aOptions = graphData.iflowOptions.filter(function (o) { return visibleKeys[o.key]; });

    return { nodes: aNodes, edges: aEdges, nodeMap: nodeMap, iflowOptions: aOptions };
  }

  function showNodeDetail(oNodeData) {
    if (oNodeData.nodeType && oNodeData.nodeType !== "iflow") {
      var sInfo = oNodeData.name + " [" + oNodeData.nodeType + "]";
      if (oNodeData.company) { sInfo += " - " + oNodeData.company; }
      if (oNodeData.email) { sInfo += " (" + oNodeData.email + ")"; }
      if (oNodeData.protocol) { sInfo += " - " + oNodeData.protocol + " " + oNodeData.direction; }
      if (oNodeData.certStatus) { sInfo += " - " + oNodeData.certStatus; }
      if (oNodeData.partnerType) { sInfo += " - " + oNodeData.partnerType; }
      MessageToast.show(sInfo);
    } else {
      MessageToast.show(
        oNodeData.name + " (" + oNodeData.id + " v" + oNodeData.version + ") - " + oNodeData.runtimeStatus
      );
    }
  }

  function showEdgeDetail(oEdgeData) {
    var sDetails = [
      "Type: " + (oEdgeData.edgeType || oEdgeData.connectionType),
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
    NODE_TYPE_COLORS: NODE_TYPE_COLORS,
    EDGE_TYPE_COLORS: EDGE_TYPE_COLORS,
    buildGraphStructure: buildGraphStructure,
    buildContextGraphStructure: buildContextGraphStructure,
    checkMissingOwnership: checkMissingOwnership,
    getPackages: getPackages,
    filterGraphByPackage: filterGraphByPackage,
    filterGraphByDeployment: filterGraphByDeployment,
    bfsImpact: bfsImpact,
    loadScript: loadScript,
    showNodeDetail: showNodeDetail,
    showEdgeDetail: showEdgeDetail
  };
});
