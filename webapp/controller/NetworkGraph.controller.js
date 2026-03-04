sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "iflow/map/prototype/util/GraphUtils"
], function (Controller, JSONModel, MessageBox, MessageToast, GraphUtils) {
  "use strict";

  return Controller.extend("iflow.map.prototype.controller.NetworkGraph", {
    onInit: function () {
      this._graphRendered = false;
      this._mode = "connection";
      this._rawData = null;
      this._contextGraphData = null;
      this._missingOwnership = {};

      var oGraphModel = new JSONModel({
        nodes: [],
        lines: [],
        statuses: this._buildStatuses(),
        iflowOptions: [],
        selectedIflowKey: "",
        nodeCount: 0,
        lineCount: 0
      });
      this.getView().setModel(oGraphModel, "graph");
    },

    onAfterRendering: function () {
      if (this._graphRendered) { return; }
      var oRawModel = this.getView().getModel("raw");
      if (!oRawModel) { return; }

      var oRaw = oRawModel.getData();
      if (oRaw && oRaw.iflows) {
        this._onRawDataReady(oRaw);
      } else {
        oRawModel.attachRequestCompleted(this._onRawRequestCompleted, this);
      }
    },

    _onRawRequestCompleted: function (oEvent) {
      if (!oEvent.getParameter("success")) {
        MessageBox.error("Failed to load mock graph data.");
        return;
      }
      this._onRawDataReady(this.getView().getModel("raw").getData());
    },

    _onRawDataReady: function (oRaw) {
      if (this._graphRendered) { return; }
      this._graphRendered = true;
      this._rawData = oRaw;
      this._contextGraphData = GraphUtils.buildContextGraphStructure(oRaw);
      var aMissing = GraphUtils.checkMissingOwnership(oRaw);
      this._missingOwnership = {};
      var that = this;
      aMissing.forEach(function (m) { that._missingOwnership[m.iflowKey] = m; });

      // Read current mode
      var oModeModel = this.getView().getModel("viewMode");
      if (oModeModel) {
        this._mode = oModeModel.getProperty("/mode") || "connection";
      }

      this._renderForMode();
    },

    onModeChange: function (sMode) {
      this._mode = sMode;
      if (this._rawData) {
        this._renderForMode();
      }
    },

    _renderForMode: function () {
      var oGraphData;
      if (this._mode === "context") {
        oGraphData = this._buildContextGraphData();
      } else {
        oGraphData = this._buildGraphData(this._rawData);
      }
      this.getView().getModel("graph").setData(oGraphData);
      this.byId("debugText").setText(
        "Loaded nodes: " + oGraphData.nodeCount + ", lines: " + oGraphData.lineCount +
        " [" + this._mode + " mode]"
      );
      this._renderGraph();
    },

    _buildStatuses: function () {
      return [
        { key: "PROCESS_DIRECT", contentColor: "#ffffff", borderColor: "#0a6ed1", backgroundColor: "#0a6ed1" },
        { key: "JMS", contentColor: "#ffffff", borderColor: "#1e8e3e", backgroundColor: "#1e8e3e" },
        { key: "DATA_STORE", contentColor: "#ffffff", borderColor: "#c05b00", backgroundColor: "#c05b00" },
        { key: "NODE_DEFAULT", contentColor: "#1f2d3d", borderColor: "#5b738b", backgroundColor: "#d9e7f7" },
        { key: "IMPACT", contentColor: "#ffffff", borderColor: "#0057a3", backgroundColor: "#0057a3" },
        { key: "MUTED", contentColor: "#5a6773", borderColor: "#8d9baa", backgroundColor: "#d5dadd" },
        // Context mode statuses
        { key: "NODE_CONTACT", contentColor: "#1f2d3d", borderColor: "#43a047", backgroundColor: "#e8f5e9" },
        { key: "NODE_PARTNER", contentColor: "#1f2d3d", borderColor: "#e65100", backgroundColor: "#fff3e0" },
        { key: "NODE_CHANNEL", contentColor: "#1f2d3d", borderColor: "#c62828", backgroundColor: "#fce4ec" },
        { key: "NODE_BIZOBJ", contentColor: "#1f2d3d", borderColor: "#7b1fa2", backgroundColor: "#f3e5f5" },
        { key: "NODE_BIZCAP", contentColor: "#1f2d3d", borderColor: "#283593", backgroundColor: "#e8eaf6" },
        { key: "NODE_CERT", contentColor: "#1f2d3d", borderColor: "#f9a825", backgroundColor: "#fff8e1" },
        { key: "MISSING_OWNER", contentColor: "#1f2d3d", borderColor: "#e65100", backgroundColor: "#fff3e0" },
        // Context edge statuses
        { key: "CONTACT_ASSIGNMENT", contentColor: "#ffffff", borderColor: "#43a047", backgroundColor: "#43a047" },
        { key: "OBJECT_ASSIGNMENT", contentColor: "#ffffff", borderColor: "#7b1fa2", backgroundColor: "#7b1fa2" },
        { key: "PARTNER_OWNS_CHANNEL", contentColor: "#ffffff", borderColor: "#e65100", backgroundColor: "#e65100" }
      ];
    },

    _buildGraphData: function (oRaw) {
      var aIflows = oRaw.iflows || [];
      var aConnections = oRaw.connections || [];

      var aNodes = aIflows.map(function (iflow) {
        return {
          key: iflow.id + "::" + iflow.version,
          title: iflow.name,
          description: "ID " + iflow.id + " | v" + iflow.version + " | " + iflow.runtimeStatus,
          status: "NODE_DEFAULT",
          _baseStatus: "NODE_DEFAULT",
          iflowId: iflow.id,
          iflowVersion: iflow.version,
          iflowName: iflow.name,
          nodeType: "iflow"
        };
      });

      var aLines = aConnections.map(function (conn) {
        var sFrom = conn.sourceIflowId + "::" + conn.sourceIflowVersion;
        var sTo = conn.targetIflowId + "::" + conn.targetIflowVersion;
        return {
          key: conn.connectionId,
          from: sFrom,
          to: sTo,
          status: conn.connectionType,
          _typeStatus: conn.connectionType,
          title: conn.connectionType + (conn.notes ? " - " + conn.notes : ""),
          lineType: conn.connectionType === "JMS" ? "Dashed" : "Solid",
          connectionType: conn.connectionType,
          notes: conn.notes || "",
          sourceIflowId: conn.sourceIflowId,
          sourceIflowVersion: conn.sourceIflowVersion,
          targetIflowId: conn.targetIflowId,
          targetIflowVersion: conn.targetIflowVersion
        };
      });

      var aIflowOptions = aNodes.map(function (n) {
        return {
          key: n.key,
          text: n.iflowName + " (" + n.iflowId + " v" + n.iflowVersion + ")"
        };
      });

      return {
        nodes: aNodes,
        lines: aLines,
        statuses: this._buildStatuses(),
        iflowOptions: aIflowOptions,
        selectedIflowKey: aIflowOptions.length ? aIflowOptions[0].key : "",
        nodeCount: aNodes.length,
        lineCount: aLines.length
      };
    },

    _buildContextGraphData: function () {
      var that = this;
      var ctxData = this._contextGraphData;

      var nodeTypeStatusMap = {
        iflow: "NODE_DEFAULT",
        contact: "NODE_CONTACT",
        partner: "NODE_PARTNER",
        partnerChannel: "NODE_CHANNEL",
        bizObject: "NODE_BIZOBJ",
        bizCapability: "NODE_BIZCAP",
        certificate: "NODE_CERT"
      };

      var aNodes = ctxData.nodes.map(function (n) {
        var status = nodeTypeStatusMap[n.nodeType] || "NODE_DEFAULT";
        if (that._missingOwnership[n.key]) {
          status = "MISSING_OWNER";
        }
        return {
          key: n.key,
          title: n.name || n.label,
          description: n.nodeType + (n.company ? " | " + n.company : "") +
                       (n.protocol ? " | " + n.protocol + " " + n.direction : "") +
                       (n.runtimeStatus ? " | " + n.runtimeStatus : "") +
                       (n.certStatus ? " | " + n.certStatus : ""),
          status: status,
          _baseStatus: status,
          iflowId: n.id,
          iflowVersion: n.version || "",
          iflowName: n.name,
          nodeType: n.nodeType
        };
      });

      var aLines = ctxData.edges.map(function (e) {
        var isDashed = (e.edgeType === "JMS" || e.edgeType === "CONTACT_ASSIGNMENT");
        return {
          key: e.id,
          from: e.source,
          to: e.target,
          status: e.edgeType,
          _typeStatus: e.edgeType,
          title: (e.edgeType || e.connectionType) + (e.notes ? " - " + e.notes : ""),
          lineType: isDashed ? "Dashed" : "Solid",
          connectionType: e.edgeType || e.connectionType,
          notes: e.notes || ""
        };
      });

      var aIflowOptions = [];
      ctxData.nodes.forEach(function (n) {
        if (n.nodeType === "iflow") {
          aIflowOptions.push({
            key: n.key,
            text: n.name + " (" + n.id + " v" + n.version + ")"
          });
        }
      });

      return {
        nodes: aNodes,
        lines: aLines,
        statuses: this._buildStatuses(),
        iflowOptions: aIflowOptions,
        selectedIflowKey: aIflowOptions.length ? aIflowOptions[0].key : "",
        nodeCount: aNodes.length,
        lineCount: aLines.length
      };
    },

    _renderGraph: function () {
      var oHost = this.byId("graphHost");
      oHost.destroyItems();

      var oModel = this.getView().getModel("graph");
      var aNodes = oModel.getProperty("/nodes") || [];
      var aLines = oModel.getProperty("/lines") || [];
      var aStatuses = oModel.getProperty("/statuses") || [];
      var that = this;

      sap.ui.require([
        "sap/suite/ui/commons/networkgraph/Graph",
        "sap/suite/ui/commons/networkgraph/Node",
        "sap/suite/ui/commons/networkgraph/Line",
        "sap/suite/ui/commons/networkgraph/Status",
        "sap/suite/ui/commons/networkgraph/layout/LayeredLayout"
      ], function (Graph, Node, Line, Status, LayeredLayout) {
        var oGraph = new Graph({
          width: "100%",
          height: "46rem",
          enableZoom: true,
          layoutAlgorithm: new LayeredLayout()
        });

        aStatuses.forEach(function (s) {
          oGraph.addStatus(new Status({
            key: s.key,
            contentColor: s.contentColor,
            borderColor: s.borderColor,
            backgroundColor: s.backgroundColor
          }));
        });

        aNodes.forEach(function (n) {
          var oNode = new Node({
            key: n.key,
            title: n.title,
            description: n.description,
            shape: "Box",
            status: n.status,
            descriptionLineSize: 2,
            maxWidth: 240
          });
          oNode.data("iflowId", n.iflowId);
          oNode.data("iflowVersion", n.iflowVersion);
          oNode.data("nodeType", n.nodeType);
          oNode.attachPress(that.onNodePress, that);
          oGraph.addNode(oNode);
        });

        aLines.forEach(function (l) {
          var oLine = new Line({
            from: l.from,
            to: l.to,
            title: l.title,
            status: l.status,
            arrowPosition: "End",
            lineType: l.lineType
          });
          oLine.attachPress(that.onLinePress, that);
          oGraph.addLine(oLine);
        });

        oHost.addItem(oGraph);
      }, function () {
        that.byId("debugText").setText("Graph modules failed to load (sap.suite.ui.commons).");
      });
    },

    onSelectedIflowChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      this.getView().getModel("graph").setProperty("/selectedIflowKey", sKey);
    },

    onDownstreamPress: function () { this._runImpact("downstream"); },
    onUpstreamPress: function () { this._runImpact("upstream"); },

    _runImpact: function (sDirection) {
      var oModel = this.getView().getModel("graph");
      var sStart = oModel.getProperty("/selectedIflowKey");
      var aNodes = oModel.getProperty("/nodes") || [];
      var aLines = oModel.getProperty("/lines") || [];

      if (!sStart) {
        MessageToast.show("Select an iFlow first.");
        return;
      }

      var aEdgesForBfs = aLines.map(function (l) {
        return { source: l.from, target: l.to };
      });
      var mVisited = GraphUtils.bfsImpact(
        aNodes.map(function (n) { return { key: n.key }; }),
        aEdgesForBfs, sStart, sDirection
      );

      aNodes.forEach(function (n) {
        n.status = mVisited[n.key] ? "IMPACT" : "MUTED";
      });

      aLines.forEach(function (l) {
        var bInImpact = !!(mVisited[l.from] && mVisited[l.to]);
        l.status = bInImpact ? l._typeStatus : "MUTED";
      });

      oModel.refresh(true);
      this._renderGraph();
    },

    onResetHighlightPress: function () {
      var oModel = this.getView().getModel("graph");
      var aNodes = oModel.getProperty("/nodes") || [];
      var aLines = oModel.getProperty("/lines") || [];

      aNodes.forEach(function (n) { n.status = n._baseStatus || "NODE_DEFAULT"; });
      aLines.forEach(function (l) { l.status = l._typeStatus || "PROCESS_DIRECT"; });

      oModel.refresh(true);
      this._renderGraph();
    },

    onNodePress: function (oEvent) {
      var oNode = oEvent.getSource();
      var sNodeType = oNode.data("nodeType") || "iflow";
      var sIflowId = oNode.data("iflowId") || oNode.getProperty("key").split("::")[0];
      var sVersion = oNode.data("iflowVersion") || oNode.getProperty("key").split("::")[1];

      if (sNodeType !== "iflow") {
        MessageToast.show(oNode.getProperty("title") + " [" + sNodeType + "]");
      } else {
        MessageToast.show("Navigate to detail: " + sIflowId + " / v" + sVersion);
      }
    },

    onLinePress: function (oEvent) {
      var oLine = oEvent.getSource();
      var oModel = this.getView().getModel("graph");
      var aLines = oModel.getProperty("/lines") || [];
      var oData = aLines.find(function (l) {
        return l.from === oLine.getProperty("from") && l.to === oLine.getProperty("to") && l.title === oLine.getProperty("title");
      });

      var sDetails = [
        "Type: " + (oData ? oData.connectionType : "N/A"),
        "From: " + oLine.getProperty("from"),
        "To: " + oLine.getProperty("to"),
        "Notes: " + ((oData && oData.notes) ? oData.notes : "-")
      ].join("\n");

      MessageBox.information(sDetails, { title: "Connection Detail" });
    }
  });
});
