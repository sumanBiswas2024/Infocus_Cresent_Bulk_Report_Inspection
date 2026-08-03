sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/table/Column",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/Input",
    "sap/ui/core/Fragment",
    "sap/ui/core/format/DateFormat" 
], (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, Column, Label, Text, Input, Fragment, DateFormat) => {
    "use strict";

    return Controller.extend("bulkreportinspection.controller.Bulk_Report_View", {

        onInit() {
            this._iStaticColumnCount = 6;
            this._iPageSize = 100;
            this._iCurrentSkip = 0;
            this._bHasMoreData = true;
            this._bIsFetching = false;

            this._aCurrentFilters = [];

            const oLocalModel = new JSONModel({ results: [] });
            this.getView().setModel(oLocalModel, "localModel");

            const oTable = this.byId("inspectionTable");
            oTable.attachEvent("firstVisibleRowChanged", this._onTableScroll, this);
        },

        onSearch() {
            const oView = this.getView();
            const sMaterial = oView.byId("inputMaterial").getValue().trim();
            const sPlant = oView.byId("inputPlant").getValue().trim();

            if (!sMaterial || !sPlant) {
                MessageBox.error("Both Material and Plant are mandatory fields.");
                return;
            }

            this._aCurrentFilters = [
                new Filter("Material", FilterOperator.EQ, sMaterial),
                new Filter("Plant", FilterOperator.EQ, sPlant)
            ];

            const oDateRange = oView.byId("inputDateRange");
            const oStartDate = oDateRange.getDateValue();
            const oEndDate = oDateRange.getSecondDateValue();

            if (oStartDate && oEndDate) {
                const oFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });

                this._aCurrentFilters.push(new Filter({
                    path: "InspectionLotCreatedOn",
                    operator: FilterOperator.BT, 
                    value1: oFormat.format(oStartDate),
                    value2: oFormat.format(oEndDate)
                }));
            }

            this._iCurrentSkip = 0;
            this._bHasMoreData = true;
            this.getView().getModel("localModel").setProperty("/results", []);
            this._removeDynamicColumns();

            this._fetchData();
        },

        _fetchData() {
            if (this._bIsFetching || !this._bHasMoreData) return;

            this._bIsFetching = true;
            const oTable = this.byId("inspectionTable");
            oTable.setBusy(true);

            const oModel = this.getOwnerComponent().getModel();

            const oListBinding = oModel.bindList(
                "/InspectionLotSerialResult",
                null,
                null,
                this._aCurrentFilters,
                {
                    $expand: "_CharResult"
                }
            );

            oListBinding.requestContexts(this._iCurrentSkip, this._iPageSize).then((aContexts) => {

                if (aContexts.length === 0 && this._iCurrentSkip === 0) {
                    this._bHasMoreData = false;
                    this._bIsFetching = false;
                    oTable.setBusy(false);
                    MessageBox.information("No inspection lot data found for the selected filters.");
                    return;
                }

                if (aContexts.length < this._iPageSize) {
                    this._bHasMoreData = false;
                }

                this._iCurrentSkip += this._iPageSize;

                // ADDED: Map through the data and inject _Selected property for the mandatory asterisk
                const aNewData = aContexts.map(oContext => {
                    const oRow = oContext.getObject();
                    oRow._Selected = false; 
                    return oRow;
                });

                const oLocalModel = this.getView().getModel("localModel");
                const aCurrentData = oLocalModel.getProperty("/results");

                const aCombinedData = aCurrentData.concat(aNewData);
                oLocalModel.setProperty("/results", aCombinedData);

                if (aCurrentData.length === 0 && aNewData.length > 0) {
                    this._generateDynamicColumns(aNewData[0]._CharResult);
                }

                this._bIsFetching = false;
                oTable.setBusy(false);

            }).catch((oError) => {
                this._bIsFetching = false;
                oTable.setBusy(false);
                MessageBox.error("Failed to fetch data from the server.");
            });
        },

        _onTableScroll(oEvent) {
            const oTable = oEvent.getSource();
            const iFirstVisible = oEvent.getParameter("firstVisibleRow");
            const iVisibleRowCount = oTable.getVisibleRowCount();
            const iTotalRows = this.getView().getModel("localModel").getProperty("/results").length;

            if (iFirstVisible + iVisibleRowCount >= iTotalRows - 10) {
                this._fetchData();
            }
        },

        onRowSelectionChange(oEvent) {
            const oTable = oEvent.getSource();
            const aSelectedIndices = oTable.getSelectedIndices();
            const oPostButton = this.byId("btnPostData");
            
            // 1. Enable/Disable Post Button
            oPostButton.setEnabled(aSelectedIndices.length > 0);

            // 2. ADDED: Toggle the _Selected property to show/hide the red asterisks
            const oLocalModel = this.getView().getModel("localModel");
            const aResults = oLocalModel.getProperty("/results");

            if (aResults) {
                // Reset all rows to false
                aResults.forEach(oRow => oRow._Selected = false);

                // Set selected rows to true
                aSelectedIndices.forEach(iIndex => {
                    const oContext = oTable.getContextByIndex(iIndex);
                    if (oContext) {
                        const sPath = oContext.getPath(); 
                        oLocalModel.setProperty(sPath + "/_Selected", true);
                    }
                });
            }
        },

        _removeDynamicColumns() {
            const oTable = this.byId("inspectionTable");
            let aColumns = oTable.getColumns();
            while (aColumns.length > this._iStaticColumnCount) {
                oTable.removeColumn(aColumns[aColumns.length - 1]);
                aColumns = oTable.getColumns();
            }
        },

        _generateDynamicColumns(aCharacteristics) {
            const oTable = this.byId("inspectionTable");
            if (!aCharacteristics) return;

            aCharacteristics.forEach((oChar, iIndex) => {
                const sSpecText = oChar.InspectionSpecificationText;

                // Sub-Column 1: Target Value
                const oTargetCol = new Column({
                    width: "140px",
                    headerSpan: [2, 1], 
                    multiLabels: [
                        new Label({ text: sSpecText, textAlign: "Center", width: "100%" ,design: "Bold"}),
                        new Label({ text: "Target Value", textAlign: "Center", width: "100%", design: "Bold" })
                    ],
                    template: new Text({
                        text: "{localModel>_CharResult/" + iIndex + "/TargetValue}"
                    })
                });
                oTable.addColumn(oTargetCol);

                // Sub-Column 2: Value Reported
                const oReportedCol = new Column({
                    width: "140px",
                    multiLabels: [
                        new Label({ text: sSpecText, textAlign: "Center", width: "100%" , design: "Bold"}), 
                        new Label({ text: "Value Reported", textAlign: "Center", width: "100%", design: "Bold" })
                    ],
                    template: new Input({
                        value: "{localModel>_CharResult/" + iIndex + "/ReportedValue}",
                        required: "{localModel>_Selected}" // ADDED: Binds the red asterisk to the selection state
                    })
                });
                oTable.addColumn(oReportedCol);
            });
        },

        // ==========================================
        // Value Help (F4) Logic
        // ==========================================

        onMaterialValueHelp(oEvent) {
            const oView = this.getView();

            if (!this._oMaterialF4Dialog) {
                Fragment.load({
                    id: oView.getId(),
                    name: "bulkreportinspection.view.fragments.MaterialValueHelp",
                    controller: this
                }).then((oDialog) => {
                    this._oMaterialF4Dialog = oDialog;
                    oView.addDependent(this._oMaterialF4Dialog);
                    this._oMaterialF4Dialog.open();
                });
            } else {
                this._oMaterialF4Dialog.open();
            }
        },

        onMaterialF4Search(oEvent) {
            const sValue = oEvent.getParameter("value");
            const oFilter = new Filter("Material", FilterOperator.Contains, sValue);
            const oBinding = oEvent.getSource().getBinding("items");
            oBinding.filter([oFilter]);
        },

        onMaterialF4Confirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                const sMaterial = oSelectedItem.getTitle();
                this.byId("inputMaterial").setValue(sMaterial);
            }
            const oBinding = oEvent.getSource().getBinding("items");
            oBinding.filter([]); 
        },

        // ==========================================
        // Post Data Logic
        // ==========================================

        onPostData() {
            const oTable = this.byId("inspectionTable");
            const aSelectedIndices = oTable.getSelectedIndices();

            if (aSelectedIndices.length === 0) {
                sap.m.MessageBox.warning("Please select at least one row to post.");
                return;
            }

            const oLocalModel = this.getView().getModel("localModel");
            const aPayload = [];
            
            let bValidationError = false;
            let sErrorMessage = "";

            const rNumericRegex = /^-?\d+(\.\d+)?$/;

            for (let i = 0; i < aSelectedIndices.length; i++) {
                const iIndex = aSelectedIndices[i];
                const oContext = oTable.getContextByIndex(iIndex);
                const oRowData = oContext.getObject();
                
                const aProcessedChars = [];

                for (let j = 0; j < oRowData._CharResult.length; j++) {
                    const oChar = oRowData._CharResult[j];
                    
                    const sReportedValue = oChar.ReportedValue ? oChar.ReportedValue.trim() : "";

                    // ADDED: 1. Strict Empty Check (Mandatory Validation)
                    if (sReportedValue === "") {
                        bValidationError = true;
                        // sErrorMessage = `Mandatory Field Missing: Please enter a value for "${oChar.InspectionSpecificationText}" on Serial Number ${oRowData.SerialNumber}.`;
                        sErrorMessage = "Please enter a value for all fields in the selected row(s).";
                        break; 
                    }

                    // ADDED: 2. Numeric Validation 
                        if (!rNumericRegex.test(sReportedValue)) {
                            bValidationError = true;
                            sErrorMessage = `Invalid input "${sReportedValue}" for characteristic "${oChar.InspectionSpecificationText}" on Serial Number ${oRowData.SerialNumber}. Only numeric values are allowed.`;
                            break; 
                        }
                    

                    aProcessedChars.push({
                        InspectionLot: oChar.InspectionLot,
                        SerialNumber: oChar.SerialNumber,
                        InspectionCharacteristic: oChar.InspectionCharacteristic,
                        InspectionSpecificationText: oChar.InspectionSpecificationText,
                        TargetValue: oChar.TargetValue,
                        ReportedValue: sReportedValue
                    });
                }

                if (bValidationError) {
                    break; 
                }

                aPayload.push({
                    InspectionLot: oRowData.InspectionLot,
                    SerialNumber: oRowData.SerialNumber,
                    Material: oRowData.Material,
                    Plant: oRowData.Plant,
                    InspectionLotQuantity: oRowData.InspectionLotQuantity,
                    InspectionLotQuantityUnit: oRowData.InspectionLotQuantityUnit,
                    InspectionLotCreatedOn: oRowData.InspectionLotCreatedOn,
                    _CharResult: aProcessedChars
                });
            }

            if (bValidationError) {
                sap.m.MessageBox.error(sErrorMessage);
                return;
            }

            const sJsonString = JSON.stringify(aPayload, null, 2);
            console.log("Payload prepared for backend:", sJsonString);

            if (!this._oPayloadDialog) {
                this._oPayloadDialog = new sap.m.Dialog({
                    title: "Generated JSON Payload (Validated)",
                    contentWidth: "600px",
                    contentHeight: "400px",
                    content: new sap.m.TextArea({
                        editable: false,
                        width: "100%",
                        rows: 20
                    }),
                    endButton: new sap.m.Button({
                        text: "Close",
                        press: () => {
                            this._oPayloadDialog.close();
                        }
                    })
                });
                this.getView().addDependent(this._oPayloadDialog);
            } 
            
            this._oPayloadDialog.getContent()[0].setValue(sJsonString);
            this._oPayloadDialog.open();
        }
    });
});