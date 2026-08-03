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
    "sap/ui/core/format/DateFormat" // <--- 1. Add DateFormat Import
], (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, Column, Label, Text, Input, Fragment, DateFormat) => {
    "use strict";

    return Controller.extend("bulkreportinspection.controller.Bulk_Report_View", {

        onInit() {
            this._iStaticColumnCount = 6;
            this._iPageSize = 100;
            this._iCurrentSkip = 0;
            this._bHasMoreData = true;
            this._bIsFetching = false;

            // 2. Variable to hold active filters for pagination
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

            // 3. Build the Filter Array dynamically
            this._aCurrentFilters = [
                new Filter("Material", FilterOperator.EQ, sMaterial),
                new Filter("Plant", FilterOperator.EQ, sPlant)
            ];

            // 4. Extract Date Range
            const oDateRange = oView.byId("inputDateRange");
            const oStartDate = oDateRange.getDateValue();
            const oEndDate = oDateRange.getSecondDateValue();

            if (oStartDate && oEndDate) {
                // OData V4 Edm.Date requires the format 'yyyy-MM-dd'
                const oFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });

                this._aCurrentFilters.push(new Filter({
                    path: "InspectionLotCreatedOn",
                    operator: FilterOperator.BT, // Between operator
                    value1: oFormat.format(oStartDate),
                    value2: oFormat.format(oEndDate)
                }));
            }

            this._iCurrentSkip = 0;
            this._bHasMoreData = true;
            this.getView().getModel("localModel").setProperty("/results", []);
            this._removeDynamicColumns();

            // Pass the filter array to the fetch function
            this._fetchData();
        },

        _fetchData() {
            if (this._bIsFetching || !this._bHasMoreData) return;

            this._bIsFetching = true;
            const oTable = this.byId("inspectionTable");
            oTable.setBusy(true);

            const oModel = this.getOwnerComponent().getModel();

            // 5. Use the globally stored filters array
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

                const aNewData = aContexts.map(oContext => oContext.getObject());
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
                // 6. Pagination now automatically uses the filters stored during onSearch
                this._fetchData();
            }
        },

        onRowSelectionChange(oEvent) {
            const oTable = oEvent.getSource();
            const aSelectedIndices = oTable.getSelectedIndices();
            const oPostButton = this.byId("btnPostData");
            
            // If length is greater than 0, setEnabled is true. Otherwise, false.
            oPostButton.setEnabled(aSelectedIndices.length > 0);
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
                    headerSpan: [2, 1], // Merges the top header across 2 columns
                    multiLabels: [
                        // Added width: "100%" to force the label to center across the span
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
                        // Added width: "100%" here as well
                        new Label({ text: sSpecText, textAlign: "Center", width: "100%" , design: "Bold"}), 
                        new Label({ text: "Value Reported", textAlign: "Center", width: "100%", design: "Bold" })
                    ],
                    template: new Input({
                        value: "{localModel>_CharResult/" + iIndex + "/ReportedValue}"
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
            // Standard OData filter mapping for the search bar inside F4
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
            // Reset filter for next time dialog is opened
            const oBinding = oEvent.getSource().getBinding("items");
            oBinding.filter([]); 
        },
        onPostData() {
            const oTable = this.byId("inspectionTable");
            const aSelectedIndices = oTable.getSelectedIndices();

            // 1. Ensure the user selected at least one row
            if (aSelectedIndices.length === 0) {
                sap.m.MessageBox.warning("Please select at least one row to post.");
                return;
            }

            const oLocalModel = this.getView().getModel("localModel");
            const aPayload = [];
            
            let bValidationError = false;
            let sErrorMessage = "";

            // Regex for integers, floats, and decimals (with optional negative sign)
            const rNumericRegex = /^-?\d+(\.\d+)?$/;

            // 2. Loop through selected rows for Validation and Data Extraction
            for (let i = 0; i < aSelectedIndices.length; i++) {
                const iIndex = aSelectedIndices[i];
                const oContext = oTable.getContextByIndex(iIndex);
                const oRowData = oContext.getObject();
                
                const aProcessedChars = [];

                // Loop through the dynamic characteristics of this specific row
                for (let j = 0; j < oRowData._CharResult.length; j++) {
                    const oChar = oRowData._CharResult[j];
                    
                    // Safely grab the user's input, trimming accidental spaces
                    const sReportedValue = oChar.ReportedValue ? oChar.ReportedValue.trim() : "";

                    // VALIDATION: Skip "PASSFAIL" target values from numeric validation
                    if (sReportedValue !== "") {
                        if (!rNumericRegex.test(sReportedValue)) {
                            bValidationError = true;
                            sErrorMessage = `Invalid input "${sReportedValue}" for characteristic "${oChar.InspectionSpecificationText}" on Serial Number ${oRowData.SerialNumber}. Only numeric values are allowed.`;
                            break; 
                        }
                    }

                    // Map the item level EXACTLY as the backend sends it, plus ReportedValue
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

                // Map the header level EXACTLY as the backend sends it
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

            // 3. Halt the post and show the error if validation failed
            if (bValidationError) {
                sap.m.MessageBox.error(sErrorMessage);
                return;
            }

            // ========================================================================
            // 4. Show the successfully validated Payload in a Pop-up Dialog
            // ========================================================================
            const sJsonString = JSON.stringify(aPayload, null, 2);
            console.log("Payload prepared for backend:", sJsonString);

            if (!this._oPayloadDialog) {
                this._oPayloadDialog = new sap.m.Dialog({
                    title: "Generated JSON Payload (Validated)",
                    contentWidth: "600px",
                    contentHeight: "400px",
                    content: new sap.m.TextArea({
                        // REMOVED 'value' property from here to prevent binding parser crash
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
            
            // Set the value OUTSIDE the constructor so it works flawlessly on the 1st click and beyond
            this._oPayloadDialog.getContent()[0].setValue(sJsonString);
            
            this._oPayloadDialog.open();
            
            
        }
    });
});