import { AnaplanFormulaVisitor } from './antlrclasses/AnaplanFormulaVisitor'
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor'
import { Stack } from 'stack-typescript'
import { FormulaContext, ParenthesisExpContext, BinaryoperationExpContext, IfExpContext, MuldivExpContext, AddsubtractExpContext, ComparisonExpContext, ConcatenateExpContext, NotExpContext, StringliteralExpContext, AtomExpContext, PlusSignedAtomContext, MinusSignedAtomContext, FuncAtomContext, AtomAtomContext, NumberAtomContext, EntityAtomContext, FuncParameterisedContext, DimensionmappingContext, FunctionnameContext, WordsEntityContext, QuotedEntityContext, DotQualifiedEntityContext, FuncSquareBracketsContext, DotQualifiedEntityLeftPartContext, DotQualifiedEntityRightPartContext, DotQualifiedEntityIncompleteContext, QuotedEntityPartContext, WordsEntityPartContext } from './antlrclasses/AnaplanFormulaParser';
import { Interval } from 'antlr4ts/misc/Interval';

// This class is used to format the formula text. 
// It is used by the AnaplanFormulaFormatter class.

// in this part we used the visitor pattern to visit the parse tree and format the formula text


export class AnaplanFormulaFormatterVisitor extends AbstractParseTreeVisitor<string> implements AnaplanFormulaVisitor<string> {
  readonly indentationStep: number = 2;
  readonly indentationLevels: Stack<number> = new Stack<number>();

 //by default we add no indentation
  defaultResult(): string {
    return ''
  }

  aggregateResult(aggregate: string, nextResult: string): string {
    return aggregate + nextResult
  }
//we add indentition when necessary
  indentationString(): string {
    return ' '.repeat(this.indentationLevels.top);
  }



  constructor(indentationStep: number) {
    super();
    this.indentationStep = indentationStep;
    this.indentationLevels.push(0);
  }
//function that adds indentation
  addIndentationString(indentation: number | null = null): string {
    if (this.indentationStep == 0) return ' ';

    this.indentationLevels.push(this.indentationLevels.top + (indentation ?? this.indentationStep));
    return '\n' + ' '.repeat(this.indentationLevels.top);
  }
//function that removes indentation
  removeIndentationString(addNewLine: boolean = false): string {
    if (this.indentationStep == 0) return ' ';

    this.indentationLevels.pop();

    return addNewLine ? '\n' + ' '.repeat(this.indentationLevels.top) : '';
  }
//visitor for the formula in general
  visitFormula(ctx: FormulaContext): string {
    return this.visit(ctx.expression());
  }
//visitor for parentesis formatting
  visitParenthesisExp(ctx: ParenthesisExpContext): string {
    return ctx.LPAREN().text + this.visit(ctx.expression()) + ctx.RPAREN().text;
  }

//visitor for If expression formatting
  visitIfExp(ctx: IfExpContext): string {
    return ctx.IF().text + this.addIndentationString() +
      this.visit(ctx._condition) + this.removeIndentationString(true) +
      ctx.THEN().text + this.addIndentationString() +
      this.visit(ctx._thenExpression) + this.removeIndentationString(true) +
      ctx.ELSE().text + this.addIndentationString() +
      this.visit(ctx._elseExpression) + this.removeIndentationString();
  }
//visitor for binary operations formatting
  visitBinaryoperationExp(ctx: BinaryoperationExpContext): string {
    return `${this.visit(ctx._left)} ${ctx.BINARYOPERATOR().text} ${this.visit(ctx._right)}`;
  }
// visitor for multiplication and division formatting
  visitMuldivExp(ctx: MuldivExpContext): string {
    return `${this.visit(ctx._left)} ${ctx._op.text} ${this.visit(ctx._right)}`;
  }
// visitor for adding and subtracting formatting
  visitAddsubtractExp(ctx: AddsubtractExpContext): string {
    return `${this.visit(ctx._left)} ${ctx._op.text} ${this.visit(ctx._right)}`;
  }
//visitor for comparison operations formatting
  visitComparisonExp(ctx: ComparisonExpContext): string {
    return `${this.visit(ctx._left)} ${ctx._op.text} ${this.visit(ctx._right)}`;
  }
//visitor for concatenation formatting
  visitConcatenateExp(ctx: ConcatenateExpContext): string {
    return `${this.visit(ctx._left)} ${ctx.AMPERSAND().text} ${this.visit(ctx._right)}`;
  }
// visitor for negation formatting
  visitNotExp(ctx: NotExpContext): string {
    return `${ctx.NOT().text} ${this.visit(ctx.expression())}`;
  }
//visitor for string literal (sequence of caracters)  
  visitStringliteralExp(ctx: StringliteralExpContext): string {
    return ctx.STRINGLITERAL().text;
  }
//visitor for atomical expressions (bit of Aanaplan formulas that are one thing)
  visitAtomExp(ctx: AtomExpContext): string {
    return this.visit(ctx.signedAtom());
  }
//visitor for postive numbers
  visitPlusSignedAtom(ctx: PlusSignedAtomContext): string {
    return ctx.PLUS().text + this.visit(ctx.signedAtom());
  }
//visitor for negative numbers
  visitMinusSignedAtomSignedAtom(ctx: MinusSignedAtomContext): string {
    return ctx.MINUS().text + this.visit(ctx.signedAtom());
  }
  // visitor for atomic functions
  visitFuncAtom(ctx: FuncAtomContext): string {
    return this.visit(ctx.func_());
  }
// visitor for atomic atoms
  visitAtomAtom(ctx: AtomAtomContext): string {
    return this.visit(ctx.atom());
  }
//visitor for scientific numbers
  visitNumberAtom(ctx: NumberAtomContext): string {
    return ctx.SCIENTIFIC_NUMBER().text;
  }
// visitor for atomic entity
  visitEntityAtom(ctx: EntityAtomContext): string {
    return this.visit(ctx.entity());
  }
//vissitor to check if a function has parameters
  visitFuncParameterised(ctx: FuncParameterisedContext): string {
    return ctx.functionname().text +
      ctx.LPAREN().text +
      ctx.expression().map(this.visit, this).join(', ') +
      ctx.RPAREN().text;
  }
//visitor to format function brackets
  visitFuncSquareBrackets(ctx: FuncSquareBracketsContext): string {
    let result = this.visit(ctx.entity());
    result += ctx.LSQUARE().text;

    let upToSquareLength = result.length;

    let addedIndent = false;
    for (let i = 0; i < ctx.dimensionmapping().length; i++) {
      if (i != 0) result += ', ';
      if (i == 1) {
        result += this.addIndentationString(upToSquareLength);
        addedIndent = true;
      }
      if (i > 1) {
        result += this.indentationString();
      }

      result += this.visit(ctx.dimensionmapping()[i]);
    }

    result += ctx.RSQUARE().text;

    if (addedIndent) result += this.removeIndentationString(true);

    return result;
  }
 //visitor for dimension mapping formattings
  visitDimensionmapping(ctx: DimensionmappingContext): string {
    return `${ctx.dimensionmappingselector().text}${ctx.COLON().text} ${this.visit(ctx.entity())}`;
  }
//visitor for function name formatting
  visitFunctionname(ctx: FunctionnameContext): string {
    return ctx.WORD().text;
  }
//visitor for entities between quotations formatting
  visitQuotedEntity(ctx: QuotedEntityContext): string {
    return ctx.quotedEntityRule().text;
  }
//visitor for entities without quotations formatting
  visitWordsEntity(ctx: WordsEntityContext): string {
    if (ctx.start.inputStream == undefined || ctx.stop == undefined) return '';

    return ctx.start.inputStream.getText(new Interval(ctx.start.startIndex, ctx.stop.stopIndex));
  }
//vistor for formatting expressions that can use a dot
  visitDotQualifiedEntity(ctx: DotQualifiedEntityContext): string {
    return this.visit(ctx._left) + ctx.DOT().text + this.visit(ctx._right);
  }
//vistor for formatting expression that will come after the dot
  visitDotQualifiedEntityLeftPart(ctx: DotQualifiedEntityLeftPartContext): string {
    return this.visit(ctx.dotQualifiedEntityPart());
  }
  //vistor for formqtting expression that came before the dot
  visitDotQualifiedEntityRightPart(ctx: DotQualifiedEntityRightPartContext): string {
    return this.visit(ctx.dotQualifiedEntityPart());
  }
  //visitor for formatting incomplete expressions that can use a dot
  visitDotQualifiedEntityIncomplete(ctx: DotQualifiedEntityIncompleteContext): string {
    return this.visit(ctx.dotQualifiedEntityLeftPart()) + ctx.DOT().text;
  }
  visitQuotedEntityPart(ctx: QuotedEntityPartContext): string {
    return ctx.QUOTELITERAL().text;
  }
  visitWordsEntityPart(ctx: WordsEntityPartContext): string {
    if (ctx.start.inputStream == undefined || ctx.stop == undefined) return '';

    return ctx.start.inputStream.getText(new Interval(ctx.start.startIndex, ctx.stop.stopIndex));
  }
}