import { CharStreams, CommonTokenStream, ParserRuleContext, Token } from "antlr4ts";
import { Interval } from "antlr4ts/misc/Interval";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { hoverProvider } from "../content-script-main";
import { FormulaQuickFixesCodeActionProvider } from "../Monaco/FormulaQuickFixesCodeActionProvider";
import { AnaplanDataTypeStrings } from "./AnaplanDataTypeStrings";
import { AnaplanFormulaTypeEvaluatorVisitor } from "./AnaplanFormulaTypeEvaluatorVisitor";
import { AnaplanMetaData, EntityMetaData, EntityType } from "./AnaplanMetaData";
import { AnaplanFormulaLexer } from "./antlrclasses/AnaplanFormulaLexer";
import { AnaplanFormulaParser } from './antlrclasses/AnaplanFormulaParser';
import { CollectorErrorListener } from "./CollectorErrorListener";
import { Format } from "./Format";
import { FormulaError } from "./FormulaError";

//this section contains function that help us while writing in the formula editor


//this function plays an important role as it detects typing for the a new formula or for editing an existing formula
export function getOriginalText(ctx: ParserRuleContext): string {
    if (ctx.start.inputStream != undefined && ctx.stop != undefined) {
        return ctx.start.inputStream.getText(new Interval(ctx.start.startIndex, ctx.stop.stopIndex));
    }
    else {
        return "";
    }
}
//a function that handles entities typing and make sure that each entity is unquoted
// to faciliate accessing line items and searching for modules

export function unQuoteEntity(entity: string | null): string {
    if (entity === null) {
        return '';
    }
    if (entity[0] == "'") {
        return entity.slice(1, -1)
    }
    else {
        return entity;
    }
}

export const anaplanTimeEntityBaseId: number = 20000000000;

type Constructor<T> = { new(...args: any[]): T };

// a function that helps us search the ancestor of each node in the parse tree

export function findAncestor<T extends ParseTree>(node: ParseTree | undefined, TName: Constructor<T>): T | undefined {
    if (node === undefined || node instanceof TName) { return node as T; }

    return findAncestor(node.parent, TName);
}

//a function that helps us search for all the descendants of each node in the parse tree

export function findDescendents<T extends ParseTree>(node: ParseTree | undefined, TName: Constructor<T>, results: T[] | undefined = undefined): T[] {
    if (node === undefined) { return []; }

    if (results === undefined) {
        results = [];
    }

    if (node instanceof TName) {
        results.push(node);
    }

    for (let i = 0; i < node?.childCount; i++) {
        findDescendents(node.getChild(i), TName, results);
    }

    return results;
}

//a function that help us get all the children of a specific node in the parse tree

export function tryGetChild<T extends ParseTree>(node: ParseTree | undefined, TName: Constructor<T>): T | undefined {
    if (node === undefined) return undefined;

    for (let i = 0; i < node?.childCount; i++) {
        if (node.getChild(i) instanceof TName) { return node.getChild(i) as T; }
    }

    return undefined;
}

//this function help us access line items in  anaplan modules using the dot notation

export function getAnaplanMetaData(currentModule: string | number, lineItemName: string) {
    let currentModuleName = "";
    let currentModuleId = 0;

    if (typeof currentModule === "string") {
        currentModuleName = currentModule;
        for (var i = 0; i < anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.entityLongIds[0].length; i++) {
            if (anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.labels[0][i] === currentModuleName) {
                currentModuleId = anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.entityLongIds[0][i];
            }
        }
    }
    else if (typeof currentModule === "number") {
        currentModuleId = currentModule;
        for (var i = 0; i < anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.entityLongIds[0].length; i++) {
            if (anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.entityLongIds[0][i] === currentModuleId) {
                currentModuleName = anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.labels[0][i];
            }
        }
    }

    let currentLineItemName = currentModuleName + "." + lineItemName;

    let moduleLineItems = new Map<string, EntityMetaData>();

    for (var i = 0; i < anaplan.data.ModelContentCache._modelInfo.moduleInfos.length; i++) {
        for (var j = 0; j < anaplan.data.ModelContentCache._modelInfo.moduleInfos[i].lineItemsLabelPage.labels[0].length; j++) {
            var entityName = anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.labels[0][i] + "." + anaplan.data.ModelContentCache._modelInfo.moduleInfos[i].lineItemsLabelPage.labels[0][j];
            var dataTypeString = anaplan.data.ModelContentCache._modelInfo.moduleInfos[i].lineItemInfos[j].format.dataType;
            if (dataTypeString != AnaplanDataTypeStrings.NONE.dataType) {
                moduleLineItems.set(entityName, new EntityMetaData(
                    anaplan.data.ModelContentCache._modelInfo.moduleInfos[i].lineItemInfos[j],
                    EntityType.LineItem,
                    anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.labels[0][i],
                    anaplan.data.ModelContentCache._modelInfo.moduleInfos[i].lineItemsLabelPage.labels[0][j],
                    undefined));

                if (dataTypeString === AnaplanDataTypeStrings.TIME_ENTITY.dataType) {

                }
            }
        }
    }

    let entityNames = new Map<number, string>();
    let entityIds = new Map<string, { id: number, type: string }>();
    let hierarchyParents = new Map<number, number>();

    for (var i = 0; i < anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.entityLongIds[0].length; i++) {
        entityNames.set(
            anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.entityLongIds[0][i],
            anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.labels[0][i]);
        entityIds.set(
            anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.labels[0][i],
            {
                id: anaplan.data.ModelContentCache._modelInfo.modulesLabelPage.entityLongIds[0][i],
                type: 'entity'
            });
    }

    let subsetMainHierachyMap = new Map<number, number>();

    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.labels[0].length; i++) {
        entityNames.set(
            anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.entityLongIds[0][i],
            anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.labels[0][i]);
        entityIds.set(
            anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.labels[0][i],
            {
                id: anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.entityLongIds[0][i],
                type: 'hierarchy'
            });
        hierarchyParents.set(
            anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].entityLongId,
            anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].parentHierarchyEntityLongId);

        for (let j = 0; j < anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].subsetEntityLongIds.length; j++) {
            subsetMainHierachyMap.set(anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].subsetEntityLongIds[j],
                anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.entityLongIds[0][i]);
        }

        // Add in the hierarchy properties as an entity
        for (let j = 0; j < anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].propertiesInfo.length; j++) {
            let entityName = anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.labels[0][i] + '.' + anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].propertiesLabelPage.labels[j];
            moduleLineItems.set(entityName, new EntityMetaData({
                parentLineItemEntityLongId: -1,
                fullAppliesTo: [anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].entityLongId],
                formulaScope: '',
                isSummary: false,
                format: anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].propertiesInfo[j].format,
            },
                EntityType.HierarchyProperty,
                anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.labels[0][i],
                anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].propertiesLabelPage.labels[j],
                undefined));
        }

        // Add in the hierarchy itself as an entity
        let format = AnaplanDataTypeStrings.ENTITY(anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].entityLongId);
        format.isNumberedList = anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].isNumberedList

        moduleLineItems.set(anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.labels[0][i], new EntityMetaData({
            parentLineItemEntityLongId: -1,
            fullAppliesTo: [],
            formulaScope: '',
            isSummary: false,
            format: format,
        },
            EntityType.Hierarchy,
            undefined,
            anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchiesLabelPage.labels[0][i],
            anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i]));
    }

    let timeFormat = new Format(AnaplanDataTypeStrings.TIME_ENTITY.dataType, undefined, undefined);
    timeFormat.periodType = { entityIndex: -1, entityGuid: undefined, entityId: undefined, entityLabel: undefined };
    moduleLineItems.set("Time", new EntityMetaData({
        parentLineItemEntityLongId: -1,
        fullAppliesTo: [],
        formulaScope: '',
        isSummary: false,
        format: timeFormat
    },
        EntityType.Hierarchy,
        undefined,
        "Time",
        undefined));

    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetsLabelPage.labels[0].length; i++) {
        entityNames.set(
            anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetsLabelPage.entityLongIds[0][i],
            anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetsLabelPage.labels[0][i]);
        entityIds.set(
            anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetsLabelPage.labels[0][i],
            {
                id: anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetsLabelPage.entityLongIds[0][i],
                type: 'hierarchysubset'
            });
    }

    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.labels[0].length; i++) {
        entityNames.set(
            anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.entityLongIds[0][i],
            anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.labels[0][i]);
        entityIds.set(
            anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.labels[0][i],
            {
                id: anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.entityLongIds[0][i],
                type: 'lineitemsubset'
            });

        // Find the module this applies to and add it's measures as entities
        for (let j = 0; j < anaplan.data.ModelContentCache._modelInfo.moduleInfos.length; j++) {
            for (let k = 0; k < anaplan.data.ModelContentCache._modelInfo.moduleInfos[j].lineItemSubsetEntityLongIds.length; k++) {
                if (anaplan.data.ModelContentCache._modelInfo.moduleInfos[j].lineItemSubsetEntityLongIds[k] ===
                    anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.entityLongIds[0][i]) {
                    // We found the module this line item subset relates to. We can't know which line items are in the subset, so we just add them all
                    for (let l = 0; l < anaplan.data.ModelContentCache._modelInfo.moduleInfos[j].lineItemsLabelPage.labels[0].length; l++) {
                        let name = `${anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.labels[0][i]}.${anaplan.data.ModelContentCache._modelInfo.moduleInfos[j].lineItemsLabelPage.labels[0][l]}`;
                        moduleLineItems.set(name, new EntityMetaData({
                            parentLineItemEntityLongId: -1,
                            fullAppliesTo: [anaplan.data.ModelContentCache._modelInfo.hierarchiesInfo.hierarchyInfos[i].entityLongId],
                            formulaScope: '',
                            isSummary: false,
                            format: anaplan.data.ModelContentCache._modelInfo.moduleInfos[j].lineItemInfos[l].format,
                        },
                            EntityType.LineItemSubSet,
                            anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.labels[0][i],
                            anaplan.data.ModelContentCache._modelInfo.moduleInfos[j].lineItemsLabelPage.labels[0][l],
                            undefined));
                    }
                    break;
                }
            }
        }


        // Add in the line item subset itself as an entity
        let format = AnaplanDataTypeStrings.ENTITY(anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetInfos[i].entityLongId);

        moduleLineItems.set(anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.labels[0][i], new EntityMetaData({
            parentLineItemEntityLongId: -1,
            fullAppliesTo: [],
            formulaScope: '',
            isSummary: false,
            format: format,
        },
            EntityType.LineItemSubSet,
            undefined,
            anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetsLabelPage.labels[0][i],
            undefined));
    }

    // Add the versions
    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.versionsLabelPage.count; i++) {
        let name = 'VERSIONS.' + anaplan.data.ModelContentCache._modelInfo.versionsLabelPage.labels[0][i];
        entityNames.set(
            // Don't use the actual version entity id for each individual version here, we want to use the 'version' entity id
            //anaplan.data.ModelContentCache._modelInfo.versionsLabelPage.entityLongIds[0][i],
            20000000020,
            name);
        entityIds.set(
            name,
            {
                id: 20000000020, //anaplan.data.ModelContentCache._modelInfo.versionsLabelPage.entityLongIds[0][i],
                type: 'version'
            });

        moduleLineItems.set(name, new EntityMetaData({
            parentLineItemEntityLongId: -1,
            fullAppliesTo: [anaplan.data.ModelContentCache._modelInfo.versionsLabelPage.entityLongIds[0][i]],
            formulaScope: '',
            isSummary: false,
            format: AnaplanDataTypeStrings.ENTITY(anaplan.data.ModelContentCache._modelInfo.versionsLabelPage.entityLongIds[0][i]),
        },
            EntityType.Version,
            "VERSIONS",
            anaplan.data.ModelContentCache._modelInfo.versionsLabelPage.labels[0][i],
            undefined));
    }

    // Add in the different time periods
    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypeLabelPages.length; i++) {
        for (let j = 0; j < anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypeLabelPages.length; j++) {
            entityNames.set(anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypeLabelPages[i].entityLongIds[0][j],
                'Time.' + anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypeLabelPages[i].labels[0][j]);
            entityIds.set('Time.' + anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypeLabelPages[i].labels[0][j],
                {
                    id: anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypeLabelPages[i].entityLongIds[0][j],
                    type: 'time'
                });
        }
    }

    // Add in the different time periods (supersets)
    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.timeScaleSupersetInfo.allowedTimeEntityPeriodTypeLabelPages.length; i++) {
        for (let j = 0; j < anaplan.data.ModelContentCache._modelInfo.timeScaleSupersetInfo.allowedTimeEntityPeriodTypeLabelPages.length; j++) {
            entityNames.set(anaplan.data.ModelContentCache._modelInfo.timeScaleSupersetInfo.allowedTimeEntityPeriodTypeLabelPages[i].entityLongIds[0][j],
                'Time.' + anaplan.data.ModelContentCache._modelInfo.timeScaleSupersetInfo.allowedTimeEntityPeriodTypeLabelPages[i].labels[0][j]);
            entityIds.set('Time.' + anaplan.data.ModelContentCache._modelInfo.timeScaleSupersetInfo.allowedTimeEntityPeriodTypeLabelPages[i].labels[0][j],
                {
                    id: anaplan.data.ModelContentCache._modelInfo.timeScaleSupersetInfo.allowedTimeEntityPeriodTypeLabelPages[i].entityLongIds[0][j],
                    type: 'time'
                });
        }
    }

    // Add in TIME.All Periods
    entityIds.set('TIME.All Periods',
        {
            id: -1,
            type: 'time'
        });
    entityNames.set(-1, 'TIME.All Periods');

    let allPeriodsFormat = new Format(AnaplanDataTypeStrings.TIME_ENTITY.dataType, undefined, undefined);
    allPeriodsFormat.periodType = { entityIndex: -1, entityGuid: undefined, entityId: undefined, entityLabel: undefined };

    moduleLineItems.set('TIME.All Periods', new EntityMetaData({
        parentLineItemEntityLongId: -1,
        fullAppliesTo: [],
        formulaScope: '',
        isSummary: false,
        format: allPeriodsFormat,
    },
        EntityType.HierarchyListItem,
        "TIME",
        "All Periods", undefined));

    // Add in the special time period types
    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypes.length; i++) {
        entityNames.set(anaplanTimeEntityBaseId + anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypes[i].entityIndex,
            'Time.' + anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypes[i].entityLabel);
        entityIds.set('Time.' + anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypes[i].entityLabel,
            {
                id: anaplanTimeEntityBaseId + anaplan.data.ModelContentCache._modelInfo.timeScaleInfo.allowedTimeEntityPeriodTypes[i].entityIndex,
                type: 'time'
            });
    }

    // Add in special entity names
    entityNames.set(20000000020, 'Version');
    entityIds.set('Version', { id: 20000000020, type: 'version' });


    let subsetParentDimensionId = new Map<number, SubsetInfo>();
    // Regular subsets (of hierarchies)
    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetInfos.length; i++) {
        subsetParentDimensionId.set(anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetInfos[i].entityLongId,
            {
                entityLongId: anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetInfos[i].entityLongId,
                parentHierarchyEntityLongId: subsetMainHierachyMap.get(anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetInfos[i].entityLongId)!,
                topLevelMainHierarchyEntityLongId: subsetMainHierachyMap.get(anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetInfos[i].entityLongId)!,
                applicableModuleEntityLongIds: anaplan.data.ModelContentCache._modelInfo.hierarchySubsetsInfo.hierarchySubsetInfos[i].applicableModuleEntityLongIds
            }
        );
    }

    // Line item subsets (of measures)
    for (let i = 0; i < anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetInfos.length; i++) {
        subsetParentDimensionId.set(anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetInfos[i].entityLongId,
            anaplan.data.ModelContentCache._modelInfo.lineItemSubsetsInfo.lineItemSubsetInfos[i]);
    }


    return new AnaplanMetaData(moduleLineItems, subsetParentDimensionId, entityNames, entityIds, hierarchyParents, currentModuleName, moduleLineItems.get(currentLineItemName)!.lineItemInfo);
}

//a function that help us get error messages after doing something wrong while writing a formula
//it calls on the visitor class to get the error message asspciated with it

export function getFormulaErrors(formula: string, anaplanMetaData: AnaplanMetaData,
    modelLineCount: number, modelLineMaxColumn: number): monaco.editor.IMarkerData[] {
    if (formula.length === 0) {
        return [];
    }

    FormulaQuickFixesCodeActionProvider.clearMarkerQuickFixes();

    let targetFormat = anaplanMetaData.getCurrentItem().format;

    let formulaEvaluator = new AnaplanFormulaTypeEvaluatorVisitor(anaplanMetaData);
    const mylexer = new AnaplanFormulaLexer(CharStreams.fromString(formula));
    let errors: FormulaError[] = [];
    mylexer.removeErrorListeners();
    const myparser = new AnaplanFormulaParser(new CommonTokenStream(mylexer));
    myparser.removeErrorListeners();
    myparser.addErrorListener(new CollectorErrorListener(errors));

    let formulaContext = myparser.formula();

    let monacoErrors: monaco.editor.IMarkerData[] = [];

    if (errors.length === 0) {
        const myresult = formulaEvaluator.visit(formulaContext);

        // Add the errors with the whole formula if needed
        if (myresult.dataType != AnaplanDataTypeStrings.UNKNOWN.dataType &&
            myresult.dataType != anaplanMetaData.getCurrentItem().format.dataType) {
            // Ensure the data type is the same if we did actually work out what it is
            let err = {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: modelLineCount,
                endColumn: modelLineMaxColumn,
                message: `Formula evaluates to ${myresult.dataType} but the line item type is ${targetFormat.dataType}`,
                severity: 8 //monaco.MarkerSeverity.Error (don't use enum so we can test)
            };
            monacoErrors.push(err);
            AddFormatConversionQuickFixes(anaplanMetaData, targetFormat, myresult, err);
        } else if (myresult.dataType === AnaplanDataTypeStrings.ENTITY(undefined).dataType) {
            // Ensure the entity types is the same if the data types are entity
            if (myresult.hierarchyEntityLongId != targetFormat.hierarchyEntityLongId) {
                monacoErrors.push({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: modelLineCount,
                    endColumn: modelLineMaxColumn,
                    message: `Formula evaluates to ${myresult.hierarchyEntityLongId === undefined ? "an invalid entity" : anaplanMetaData.getEntityNameFromId(myresult.hierarchyEntityLongId)} but the line item type is ${anaplanMetaData.getEntityNameFromId(targetFormat.hierarchyEntityLongId!)}`,
                    severity: 8 //monaco.MarkerSeverity.Error (don't use enum so we can test)
                });
            }
        }
        else if (myresult.dataType === AnaplanDataTypeStrings.TIME_ENTITY.dataType) {
            // Ensure the period types are the same if the data types are time entities
            if (myresult.periodType != undefined && targetFormat.periodType != undefined && myresult.periodType.entityId != targetFormat.periodType.entityId) {
                monacoErrors.push({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: modelLineCount,
                    endColumn: modelLineMaxColumn,
                    message: `Formula evaluates to a ${myresult.periodType.entityLabel} period but the line item type is ${targetFormat.periodType.entityLabel}`,
                    severity: 4 //monaco.MarkerSeverity.Warning (don't use enum so we can test). It's a warning since Anaplan allows it
                });
            }
        }
    }

    if (errors.length != 0) {
        // If we have parser errors, then we only care about those, not whether or not the formula evaluates to what we need (since if there are errors the evaluation could easily be wrong anyway)
        monacoErrors = [];
        for (let e of errors) {
            monacoErrors.push(e);
        };
    }
    else {
        // We don't have parser errors, so add the formula errors in
        for (let e of formulaEvaluator.formulaErrors) {
            monacoErrors.push(e);
        };
    }

    for (let i = 0; i < monacoErrors.length; i++) {
        if (monacoErrors[i].message.startsWith("no viable alternative at input")) {
            monacoErrors[i].message = "syntax error; found unexpected character" + (monacoErrors[i].endColumn === monacoErrors[i].startColumn + 1 ? "" : "(s)");
        }
    }

    return monacoErrors;
}
export function getRangeFromContext(ctx: ParserRuleContext | Token | undefined) {
    if (ctx === undefined) return undefined;
    if (ctx instanceof ParserRuleContext) {
        return {
            startLineNumber: ctx.start.line,
            endLineNumber: ctx.stop?.line ?? ctx.start.line,
            startColumn: ctx.start.charPositionInLine + 1,
            endColumn: ctx.stop === undefined ? ctx.start.charPositionInLine + 1 + (ctx.start.stopIndex - ctx.start.startIndex) + 1 : ctx.stop.charPositionInLine + 1 + (ctx.stop.stopIndex - ctx.stop.startIndex) + 1,
        };
    }
    else {
        return {
            startLineNumber: ctx.line,
            endLineNumber: ctx.line,
            startColumn: ctx.charPositionInLine + 1,
            endColumn: ctx.stopIndex === undefined ? ctx.charPositionInLine + 1 + (ctx.stopIndex - ctx.startIndex) + 1 : ctx.charPositionInLine + 1 + (ctx.stopIndex - ctx.startIndex) + 1,
        };
    }
}

//function that gives us the option to get the quick fix option

function hasOwnProperty<X extends {}>(obj: X, prop: string): obj is X & Record<string, unknown> {
    return obj.hasOwnProperty(prop)
}

export function AddTextSurroundQuickFix(anaplanMetaData: AnaplanMetaData, prefix: string, suffix: string, err: monaco.editor.IMarkerData | undefined, ctxToFix: ParserRuleContext | undefined, message: string, isPreferred: boolean): void {
    if (err === undefined) return;

    let targetRange = getRangeFromContext(ctxToFix) ?? err;
    FormulaQuickFixesCodeActionProvider.setMarkerQuickFix(err,
        [{
            title: message,
            diagnostics: [],
            kind: "quickfix",
            edit: {
                edits: [
                    {
                        resource: {} as any,
                        edit: {
                            range: {
                                startLineNumber: targetRange.startLineNumber,
                                startColumn: targetRange.startColumn,
                                endLineNumber: targetRange.startLineNumber,
                                endColumn: targetRange.startColumn
                            },
                            text: prefix
                        }
                    },
                    {
                        resource: {} as any,
                        edit: {
                            range: {
                                startLineNumber: targetRange.endLineNumber,
                                startColumn: targetRange.endColumn,
                                endLineNumber: targetRange.endLineNumber,
                                endColumn: targetRange.endColumn
                            },
                            text: suffix
                        }
                    }
                ]
            },
            isPreferred: isPreferred,
        }]);
}
export function AddFormatConversionQuickFixes(anaplanMetaData: AnaplanMetaData, targetFormat: Format | string, resultFormat: Format, err: monaco.editor.IMarkerData | undefined, ctxToFix: ParserRuleContext | undefined = undefined, messagePrefix: string | undefined = undefined): void {
    if (err === undefined) return;

    messagePrefix ??= "";

    let targetFormatString = hasOwnProperty(targetFormat, 'dataType') ? targetFormat.dataType : targetFormat;
    if (targetFormatString === AnaplanDataTypeStrings.TEXT.dataType &&
        resultFormat.dataType === AnaplanDataTypeStrings.NUMBER.dataType) {
        // Add a quick fix to convert the formula to text
        AddTextSurroundQuickFix(anaplanMetaData, "TEXT(", ")", err, ctxToFix, messagePrefix + "Convert using TEXT()", true);
    }
    else if (targetFormatString === AnaplanDataTypeStrings.NUMBER.dataType &&
        resultFormat.dataType === AnaplanDataTypeStrings.TEXT.dataType) {
        AddTextSurroundQuickFix(anaplanMetaData, "VALUE(", ")", err, ctxToFix, messagePrefix + "Convert using VALUE()", true);
    }
    // Add a quick fix to convert from text to entity (using FINDITEM)
    else if ((targetFormat as any).hierarchyEntityLongId !== undefined &&
        resultFormat.dataType === AnaplanDataTypeStrings.TEXT.dataType) {
        // Use FINDITEM to find the entity
        AddTextSurroundQuickFix(anaplanMetaData, `FINDITEM(${anaplanMetaData.quoteIfNeeded(anaplanMetaData.getEntityNameFromId((targetFormat as any).hierarchyEntityLongId))}, `, ")", err, ctxToFix, messagePrefix + "Lookup the item using FINDITEM()", true);
    }
    else if (targetFormatString === AnaplanDataTypeStrings.TEXT.dataType &&
        resultFormat.dataType === AnaplanDataTypeStrings.ENTITY(undefined).dataType) {
        // Use CODE() or NAME() (preferring the correct one based on the hierarchy being a numered list or not) to go from entity to text
        AddTextSurroundQuickFix(anaplanMetaData, "NAME(", ")", err, ctxToFix, messagePrefix + "Get the name of the entity using NAME()", !(resultFormat.isNumberedList === true));
        AddTextSurroundQuickFix(anaplanMetaData, "CODE(", ")", err, ctxToFix, messagePrefix + "Get the code of the entity using CODE()", (resultFormat.isNumberedList === true));
    }
}

export function setModelErrors(model: monaco.editor.ITextModel, anaplanMetaData: AnaplanMetaData) {
    hoverProvider.updateMetaData(anaplanMetaData);

    let modelLineCount = model.getLineCount();
    monaco.editor.setModelMarkers(model, "owner", getFormulaErrors(model.getValue(), anaplanMetaData, modelLineCount, model.getLineMaxColumn(modelLineCount)));
}