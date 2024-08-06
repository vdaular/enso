use crate::prelude::*;

use crate::empty_tree;
use crate::syntax::item;
use crate::syntax::maybe_with_error;
use crate::syntax::operator::Precedence;
use crate::syntax::statement::find_top_level_operator;
use crate::syntax::statement::parse_pattern;
use crate::syntax::token;
use crate::syntax::tree;
use crate::syntax::tree::ArgumentDefault;
use crate::syntax::tree::ArgumentDefinition;
use crate::syntax::tree::ArgumentDefinitionLine;
use crate::syntax::tree::ArgumentType;
use crate::syntax::tree::ReturnSpecification;
use crate::syntax::tree::SyntaxError;
use crate::syntax::Item;
use crate::syntax::Token;
use crate::syntax::Tree;



pub fn parse_function_decl<'s>(
    items: &mut Vec<Item<'s>>,
    start: usize,
    qn_len: usize,
    precedence: &mut Precedence<'s>,
    args_buffer: &mut Vec<ArgumentDefinition<'s>>,
) -> (Tree<'s>, Vec<ArgumentDefinition<'s>>, Option<ReturnSpecification<'s>>) {
    let mut arg_starts = vec![];
    let mut arrow = None;
    for (i, item) in items.iter().enumerate().skip(start + qn_len) {
        if let Item::Token(Token { variant: token::Variant::ArrowOperator(_), .. }) = item {
            arrow = Some(i);
            break;
        }
        if i == start + qn_len || matches!(Spacing::of_item(item), Spacing::Spaced) {
            arg_starts.push(i);
        }
    }
    let return_ = arrow.map(|arrow| parse_return_spec(items, arrow, precedence));

    args_buffer.extend(
        arg_starts.drain(..).rev().map(|arg_start| parse_arg_def(items, arg_start, precedence)),
    );
    let args = args_buffer.drain(..).rev().collect();

    let qn = precedence.resolve_non_section(items.drain(start..)).unwrap();

    (qn, args, return_)
}

pub fn parse_constructor_definition<'s>(
    items: &mut Vec<Item<'s>>,
    start: usize,
    precedence: &mut Precedence<'s>,
    args_buffer: &mut Vec<ArgumentDefinition<'s>>,
) -> Tree<'s> {
    let mut block_args = vec![];
    if matches!(items.last().unwrap(), Item::Block(_)) {
        let Item::Block(block) = items.pop().unwrap() else { unreachable!() };
        block_args.extend(block.into_vec().into_iter().map(|item::Line { newline, mut items }| {
            let argument = (!items.is_empty()).then(|| parse_arg_def(&mut items, 0, precedence));
            ArgumentDefinitionLine { newline, argument }
        }))
    }
    let (name, inline_args) = parse_constructor_decl(items, start, precedence, args_buffer);
    Tree::constructor_definition(name, inline_args, block_args)
}

fn parse_constructor_decl<'s>(
    items: &mut Vec<Item<'s>>,
    start: usize,
    precedence: &mut Precedence<'s>,
    args_buffer: &mut Vec<ArgumentDefinition<'s>>,
) -> (token::Ident<'s>, Vec<ArgumentDefinition<'s>>) {
    let args = parse_type_args(items, start + 1, precedence, args_buffer);
    let Item::Token(name) = items.pop().unwrap() else { unreachable!() };
    let Token { variant: token::Variant::Ident(variant), .. } = name else { unreachable!() };
    let name = name.with_variant(variant);
    debug_assert_eq!(items.len(), start);
    (name, args)
}

pub fn parse_type_args<'s>(
    items: &mut Vec<Item<'s>>,
    start: usize,
    precedence: &mut Precedence<'s>,
    args_buffer: &mut Vec<ArgumentDefinition<'s>>,
) -> Vec<ArgumentDefinition<'s>> {
    if start == items.len() {
        return default();
    }
    let mut arg_starts = vec![start];
    let mut expecting_rhs = false;
    for (i, item) in items.iter().enumerate().skip(start + 1) {
        if expecting_rhs {
            expecting_rhs = false;
            continue;
        }
        if let Item::Token(Token { variant: token::Variant::AssignmentOperator(_), .. }) = item {
            expecting_rhs = true;
            continue;
        }
        if matches!(Spacing::of_item(item), Spacing::Spaced) {
            arg_starts.push(i);
        }
    }
    args_buffer.extend(
        arg_starts.drain(..).rev().map(|arg_start| parse_arg_def(items, arg_start, precedence)),
    );
    debug_assert_eq!(items.len(), start);
    args_buffer.drain(..).rev().collect()
}

pub fn try_parse_foreign_function<'s>(
    items: &mut Vec<Item<'s>>,
    start: usize,
    operator: &mut Option<token::AssignmentOperator<'s>>,
    expression: &mut Option<Tree<'s>>,
    precedence: &mut Precedence<'s>,
    args_buffer: &mut Vec<ArgumentDefinition<'s>>,
) -> Option<Tree<'s>> {
    match items.get(start) {
        Some(Item::Token(token)) if token.code == "foreign" => {}
        _ => return None,
    }
    let operator = operator.take().unwrap();
    match items.get(start + 1) {
        Some(Item::Token(Token { variant: token::Variant::Ident(ident), .. }))
            if !ident.is_type => {}
        _ => {
            items.push(Item::from(Token::from(operator)));
            items.extend(expression.take().map(Item::from));
            return precedence
                .resolve_non_section(items.drain(start..))
                .unwrap()
                .with_error(SyntaxError::ForeignFnExpectedLanguage)
                .into();
        }
    }
    match items.get(start + 2) {
        Some(Item::Token(Token { variant: token::Variant::Ident(ident), .. }))
            if !ident.is_type => {}
        _ => {
            items.push(Item::from(Token::from(operator)));
            items.extend(expression.take().map(Item::from));
            return precedence
                .resolve_non_section(items.drain(start..))
                .unwrap()
                .with_error(SyntaxError::ForeignFnExpectedName)
                .into();
        }
    }

    let body = expression
        .take()
        .map(|body| {
            let error = match &body.variant {
                tree::Variant::TextLiteral(_) => None,
                _ => Some(SyntaxError::ForeignFnExpectedStringBody),
            };
            maybe_with_error(body, error)
        })
        .unwrap_or_else(|| {
            empty_tree(operator.code.position_after())
                .with_error(SyntaxError::ForeignFnExpectedStringBody)
        });

    let mut arg_starts = vec![];
    for (i, item) in items.iter().enumerate().skip(start + 3) {
        if i == start + 3 || matches!(Spacing::of_item(item), Spacing::Spaced) {
            arg_starts.push(i);
        }
    }
    args_buffer.extend(
        arg_starts.drain(..).rev().map(|arg_start| parse_arg_def(items, arg_start, precedence)),
    );
    let args = args_buffer.drain(..).rev().collect();

    let Item::Token(name) = items.pop().unwrap() else { unreachable!() };
    let token::Variant::Ident(variant) = name.variant else { unreachable!() };
    let name = name.with_variant(variant);

    let Item::Token(language) = items.pop().unwrap() else { unreachable!() };
    let token::Variant::Ident(variant) = language.variant else { unreachable!() };
    let language = language.with_variant(variant);

    let Item::Token(keyword) = items.pop().unwrap() else { unreachable!() };
    let keyword = keyword.with_variant(token::variant::ForeignKeyword());

    Tree::foreign_function(keyword, language, name, args, operator, body).into()
}

#[derive(Debug, PartialEq, Eq)]
enum IsParenthesized {
    Parenthesized,
    Unparenthesized,
}
use crate::syntax::treebuilding::Spacing;
use IsParenthesized::*;

struct ArgDefInfo {
    type_:   Option<(IsParenthesized, usize)>,
    default: Option<usize>,
}

fn parse_return_spec<'s>(
    items: &mut Vec<Item<'s>>,
    arrow: usize,
    precedence: &mut Precedence<'s>,
) -> ReturnSpecification<'s> {
    let r#type = precedence.resolve_non_section(items.drain(arrow + 1..));
    let Item::Token(arrow) = items.pop().unwrap() else { unreachable!() };
    let token::Variant::ArrowOperator(variant) = arrow.variant else { unreachable!() };
    let arrow = arrow.with_variant(variant);
    let r#type = r#type.unwrap_or_else(|| {
        empty_tree(arrow.code.position_after()).with_error(SyntaxError::ExpectedExpression)
    });
    ReturnSpecification { arrow, r#type }
}

fn parse_arg_def<'s>(
    items: &mut Vec<Item<'s>>,
    mut start: usize,
    precedence: &mut Precedence<'s>,
) -> ArgumentDefinition<'s> {
    let mut open1 = None;
    let mut close1 = None;
    let mut parenthesized_body = None;
    if matches!(items[start..], [Item::Group(_)]) {
        let Some(Item::Group(item::Group { open, body, close })) = items.pop() else {
            unreachable!()
        };
        open1 = open.into();
        close1 = close;
        parenthesized_body = body.into_vec().into();
        debug_assert_eq!(items.len(), start);
        start = 0;
    }
    let items = parenthesized_body.as_mut().unwrap_or(items);
    let ArgDefInfo { type_, default } = match analyze_arg_def(&items[start..]) {
        Err(e) => {
            let pattern =
                precedence.resolve_non_section(items.drain(start..)).unwrap().with_error(e);
            return ArgumentDefinition {
                open: open1,
                open2: None,
                suspension: None,
                pattern,
                type_: None,
                close2: None,
                default: None,
                close: close1,
            };
        }
        Ok(arg_def) => arg_def,
    };
    let default = default.map(|default| {
        let tree = precedence.resolve(items.drain(start + default + 1..));
        let Item::Token(equals) = items.pop().unwrap() else { unreachable!() };
        let expression = tree.unwrap_or_else(|| {
            empty_tree(equals.code.position_after()).with_error(SyntaxError::ExpectedExpression)
        });
        let Token { variant: token::Variant::AssignmentOperator(variant), .. } = equals else {
            unreachable!()
        };
        let equals = equals.with_variant(variant);
        ArgumentDefault { equals, expression }
    });
    let mut open2 = None;
    let mut close2 = None;
    let mut suspension_and_pattern = None;
    let type_ = type_.map(|(parenthesized, type_)| {
        let mut parenthesized_body = None;
        if parenthesized == Parenthesized
            && (start..items.len()).len() == 1
            && matches!(items.last(), Some(Item::Group(_)))
        {
            let Some(Item::Group(item::Group { open, body, close })) = items.pop() else {
                unreachable!()
            };
            open2 = open.into();
            close2 = close;
            parenthesized_body = body.into_vec().into();
            start = 0;
        }
        let items = parenthesized_body.as_mut().unwrap_or(items);
        let tree = precedence.resolve_non_section(items.drain(start + type_ + 1..));
        let Item::Token(operator) = items.pop().unwrap() else { unreachable!() };
        let type_ = tree.unwrap_or_else(|| {
            empty_tree(operator.code.position_after()).with_error(SyntaxError::ExpectedType)
        });
        let token::Variant::TypeAnnotationOperator(variant) = operator.variant else {
            unreachable!()
        };
        let operator = operator.with_variant(variant);
        suspension_and_pattern = Some(parse_pattern(items, start, precedence));
        ArgumentType { operator, type_ }
    });
    let (suspension, pattern) =
        suspension_and_pattern.unwrap_or_else(|| parse_pattern(items, start, precedence));
    let pattern = pattern.unwrap_or_else(|| {
        empty_tree(
            suspension
                .as_ref()
                .map(|t| t.code.position_after())
                .or_else(|| open2.as_ref().map(|t| t.code.position_after()))
                .or_else(|| open1.as_ref().map(|t| t.code.position_after()))
                .or_else(|| type_.as_ref().map(|t| t.operator.left_offset.code.position_before()))
                // Why does this one need a type annotation???
                .or_else(|| {
                    close2
                        .as_ref()
                        .map(|t: &token::CloseSymbol| t.left_offset.code.position_before())
                })
                .or_else(|| default.as_ref().map(|t| t.equals.left_offset.code.position_before()))
                .or_else(|| close1.as_ref().map(|t| t.left_offset.code.position_before()))
                .unwrap(),
        )
        .with_error(SyntaxError::ArgDefExpectedPattern)
    });
    ArgumentDefinition {
        open: open1,
        open2,
        suspension,
        pattern,
        type_,
        close2,
        default,
        close: close1,
    }
}

fn analyze_arg_def(outer: &[Item]) -> Result<ArgDefInfo, SyntaxError> {
    let mut default = None;
    let mut type_ = None;
    match find_top_level_operator(outer)? {
        None => {}
        Some((
            annotation_op_pos,
            Token { variant: token::Variant::TypeAnnotationOperator(_), .. },
        )) => {
            type_ = (Unparenthesized, annotation_op_pos).into();
        }
        Some((assignment_op_pos, Token { variant: token::Variant::AssignmentOperator(_), .. })) => {
            default = assignment_op_pos.into();
            match find_top_level_operator(&outer[..assignment_op_pos])? {
                None => {}
                Some((
                    annotation_op_pos,
                    Token { variant: token::Variant::TypeAnnotationOperator(_), .. },
                )) => {
                    type_ = (Unparenthesized, annotation_op_pos).into();
                }
                Some(_) => return Err(SyntaxError::ArgDefUnexpectedOpInParenClause),
            }
        }
        Some(_) => return Err(SyntaxError::ArgDefUnexpectedOpInParenClause),
    };
    if type_.is_none() {
        if let Item::Group(item::Group { body: inner, .. }) = &outer[0] {
            let inner_op = find_top_level_operator(inner)?;
            type_ = (Parenthesized, match inner_op {
                None => return Err(SyntaxError::ArgDefSpuriousParens),
                Some((
                    inner_op_pos,
                    Token { variant: token::Variant::TypeAnnotationOperator(_), .. },
                )) => inner_op_pos,
                Some(_) => return Err(SyntaxError::ArgDefUnexpectedOpInParenClause),
            })
                .into();
        }
    }
    Ok(ArgDefInfo { type_, default })
}