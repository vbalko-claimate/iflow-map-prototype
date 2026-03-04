sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
  "use strict";

  return Controller.extend("iflow.map.prototype.controller.Main", {
    onInit: function () {
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

      var oRawModel = new JSONModel();
      oRawModel.attachRequestCompleted(this._onRawDataLoaded, this);
      oRawModel.loadData("model/mockData.json");
      this.getView().setModel(oRawModel, "raw");
      this.byId("debugText").setText("Debug: controller initialized, loading mock data...");
    },

    _onRawDataLoaded: function (oEvent) {
      if (!oEvent.getParameter("success")) {
        MessageBox.error("Failed to load mock graph data.");
        return;
      }
      var oRaw = this.getView().getModel("raw").getData();
      var oGraphData = this._buildGraphData(oRaw);
      this.getView().getModel("graph").setData(oGraphData);
      this.byId("debugText").setText(
        "Loaded nodes: " + oGraphData.nodeCount + ", lines: " + oGraphData.lineCount
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
        { key: "MUTED", contentColor: "#5a6773", borderColor: "#8d9baa", backgroundColor: "#d5dadd" }
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
          iflowName: iflow.name
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

    onHighlightImpactPress: function () {
      var oModel = this.getView().getModel("graph");
      var sStart = oModel.getProperty("/selectedIflowKey");
      var aNodes = oModel.getProperty("/nodes") || [];
      var aLines = oModel.getProperty("/lines") || [];

      if (!sStart) {
        MessageToast.show("Select an iFlow first.");
        return;
      }

      var mAdj = Object.create(null);
      aNodes.forEach(function (n) { mAdj[n.key] = []; });
      aLines.forEach(function (l) {
        if (mAdj[l.from]) { mAdj[l.from].push(l.to); }
        if (mAdj[l.to]) { mAdj[l.to].push(l.from); }
      });

      var mVisited = Object.create(null);
      var aQueue = [sStart];
      mVisited[sStart] = true;

      while (aQueue.length) {
        var sCurrent = aQueue.shift();
        var aNext = mAdj[sCurrent] || [];
        aNext.forEach(function (k) {
          if (!mVisited[k]) {
            mVisited[k] = true;
            aQueue.push(k);
          }
        });
      }

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
      var sIflowId = oNode.data("iflowId") || oNode.getProperty("key").split("::")[0];
      var sVersion = oNode.data("iflowVersion") || oNode.getProperty("key").split("::")[1];
      MessageToast.show("Navigate to detail: " + sIflowId + " / v" + sVersion);
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
