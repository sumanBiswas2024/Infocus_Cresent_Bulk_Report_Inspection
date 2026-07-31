/*global QUnit*/

sap.ui.define([
	"bulkreportinspection/controller/Bulk_Report_View.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Bulk_Report_View Controller");

	QUnit.test("I should test the Bulk_Report_View controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
