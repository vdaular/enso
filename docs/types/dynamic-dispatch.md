---
layout: developer-doc
title: Dynamic Dispatch
category: types
tags: [types, dispatch]
order: 6
---

# Dynamic Dispatch

Enso is a language that supports pervasive dynamic dispatch. This is a big boon
for usability, as users can write very flexible code that still plays nicely
with the GUI.

The current implementation of Enso supports single dispatch (dispatch purely on
the type of `self`) when calling function. When calling (binary) operators Enso
may perform more complicated dispatch when searching for the right operator
implementation to invoke.

<!-- MarkdownTOC levels="2,3" autolink="true" -->

- [Specificity](#specificity)
- [Multiple Dispatch](#multiple-dispatch)

<!-- /MarkdownTOC -->

## Specificity

In order to determine which of the potential dispatch candidates is the correct
one to select, the compiler needs to have a notion of _specificity_, which is
effectively an algorithm for determining which candidate is more specific than
another.

> [!WARNING] Static compiler selects nothing. The right method to invoke is
> _selected in the runtime_.
>
> - Always prefer a member function for both `x.f y` and `f y x` notations.
> - Only member functions, current module's functions, and imported functions
>   are considered to be in scope. Local variable `f` could not be used in the
>   `x.f y` syntax.
> - Selecting the matching function:
>   1. Look up the member function. If it exists, select it.
>   2. If not, find all functions with the matching name in the current module
>      and all directly imported modules. These functions are the _candidates_.
>   3. Eliminate any candidate `X` for which there is another candidate `Y`
>      whose `this` argument type is strictly more specific. That is, `Y` this
>      type is a substitution of `X` this type but not vice versa.
>   4. If not all of the remaining candidates have the same this type, the
>      search fails.
>   5. Eliminate any candidate `X` for which there is another candidate `Y`
>      which type signature is strictly more specific. That is, `Y` type
>      signature is a substitution of `X` type signature.
>   6. If exactly one candidate remains, select it. Otherwise, the search fails.

The runtime system of Enso identifies the type of a value in `obj.method_name`
invocation. It checks the _table of virtual methods_ for given type and finds
proper implementation of `method_name` to invoke. Should there be no method of
given name in the value's type (or its supertypes like `Any`) to invoke, a
`No_Such_Method` panic is raised.

There is a special dispatch for
[broken values & warnings](../semantics/errors.md).

## Multiple Dispatch

Multiple dispatch is currently used for
[binary operators](../syntax/functions.md#type-ascriptions-and-operator-resolution).

Multiple dispatch is also used on `from` conversions, because in expression
`T.from x` the function to use is based on both `T` and `x`.

> [!WARNING] Supporting general _multiple dispatch is unlikely_
>
> Supporting it for general functions remains an open question as to whether we
> want to support proper multiple dispatch in Enso. Multiple dispatch refers to
> the dynamic dispatch target being determined based not only on the type of the
> `this` argument, but the types of the other arguments to the function.
>
> To do multiple dispatch properly, it is very important to get a rigorous
> specification of the specificity algorithm. It must account for:
>
> - The typeset subsumption relationship.
> - The ordering of arguments.
> - How to handle defaulted and lazy arguments.
> - Constraints in types. This means that for two candidates `f` and `g`, being
>   dispatched on a type `t` with constraint `c`, the more specific candidate is
>   the one that explicitly matches the constraints. An example follows:
>
> ```ruby
>   type HasName
>     name : String
>
>   greet : t -> Nothing in IO
>   greet _ = print "I have no name!"
>
>   greet : (t : HasName) -> Nothing in IO
>   greet t = print 'Hi, my name is `t.name`!'
>
>   type Person
>     Pers (name : String)
>
>   main =
>     p1 = Person.Pers "Joe"
>     greet p1 # Hi, my name is Joe!
>     greet 7  # I have no name
> ```
>
> Here, because `Person` conforms to the `HasName` interface, the second `greet`
> implementation is chosen because the constraints make it more specific.
