# Keep trailing zeros in Intl.NumberFormat and Intl.PluralRules

## Status

Champion: Eemeli Aro

Stage: 2.7  
Reviewers: Richard Gibson ([#7](https://github.com/tc39/proposal-intl-keep-trailing-zeros/issues/7)) and Shane Carr ([#8](https://github.com/tc39/proposal-intl-keep-trailing-zeros/issues/8))

Presentations:
- [For Stage 1](https://docs.google.com/presentation/d/1gunNRRXJNdDwqTHh-XjV3ueI8PFasRI9WcF4KfWvxE0/edit?usp=sharing) (2025.05)
- [For Stage 2/2.7](https://docs.google.com/presentation/d/1hKJFrDfiGeqPWm51fQFQb4M4CeYm3ultB7Opef1BVuE/edit?usp=sharing) (2025.07)

## Motivation

Trailing zeros are important when formatting numbers or selecting their plural categories,
and should be retained when included in a numeric string input value.

## Use cases

Currently, trailing zeros are discarded:

```js
const nf = new Intl.NumberFormat("en");
nf.format("1.0") === "1";

const pr = new Intl.PluralRules("en");
pr.select("1.0") === "one";
```

Instead, they should be retained:

```js
const nf = new Intl.NumberFormat("en");
nf.format("1.0") === "1.0";

const pr = new Intl.PluralRules("en");
pr.select("1.0") === "other";
```

## Description

Currently, Intl.NumberFormat and Intl.PluralRules accept numeric strings as input,
converting such internally to an [Intl Mathematical Value](https://tc39.es/ecma402/#sec-tointlmathematicalvalue)
with arbitrary decimal precision.

If accepted, this proposal would change the internals of these interfaces
such that trailing zeros would be retained,
and included in the formatted or selected value.
The treatment of Number or BigInt values would not change,
and options such as `maximumFractionDigits` would still work as before:

```js
const nf = new Intl.NumberFormat('en', { minimumFractionDigits: 1 });

nf.format('1') === '1.0'
nf.format('1.00') === '1.00'
nf.format('1.0000') === '1.000'
  // maximumFractionDigits default is 3.
```

## Background

The treatment of numeric string values was previously changed in 2023 as a part of the
[Intl.NumberFormat V3 proposal](https://github.com/tc39/proposal-intl-numberformat-v3/?tab=readme-ov-file#interpret-strings-as-decimals-ecma-402-334),
before which they were parsed into lower-precision Number values.

The [Decimal proposal](https://github.com/tc39/proposal-decimal) is looking to introduce
a numeric type capable of representing values with up to 34 decimal places of precision,
along with a separate representation of the value's precision via `Decimal.Amount` or some other representation.
Currently, the effective limits for the precision of Intl.NumberFormat and Intl.PluralRules
are around 300 decimal places for the integer part, and 100 places for the fraction part.
The maximum limit for the fraction precision was increased in 2023 from 20 to 100 in [ECMA-402 PR #786](https://github.com/tc39/ecma402/pull/786).

A numerical string representation of a Number with trailing zeros is available as `Number.prototype.toPrecision`:
```js
(42).toPrecision(4) === "42.00"
(4200).toPrecision(2) === "4.2e+3"
```

<!--
## Implementations

### Polyfill/transpiler implementations

_A JavaScript implementation of the proposal, ideally packaged in a way that enables easy, realistic experimentation. See [implement.md](https://github.com/tc39/how-we-work/blob/master/implement.md) for details on creating useful prototype implementations._

You can try out an implementation of this proposal in the npm package [frobnicate](https://www.npmjs.com/package/frobnicate). Note, this package has semver major version 0 and is subject to change.

### Native implementations

_For Stage 3+ proposals, and occasionally earlier, it is helpful to link to the implementation status of full, end-to-end JavaScript engines. Filing these issues before Stage 3 is somewhat unnecessary, though, as it's not very actionable._

- [V8](link) (_Links to tracking issues in each JS engine_)
- [JSC](link)
- [SpiderMonkey](link)
- ...

## Q&A

_Frequently asked questions, or questions you think might be asked. Issues on the issue tracker or questions from past reviews can be a good source for these._

**Q**: Why is the proposal this way?

**A**: Because reasons!

**Q**: Why does this need to be built-in, instead of being implemented in JavaScript?

**A**: We could encourage people to continue doing this in user-space. However, that would significantly increase load time of web pages. Additionally, web browsers already have a built-in frobnicator which is higher quality.

**Q**: Is it really necessary to create such a high-level built-in construct, rather than using lower-level primitives?

**A**: Instead of providing a direct `frobnicate` method, we could expose more basic primitives to compose an md5 hash with rot13. However, rot13 was demonstrated to be insecure in 2012 (citation), so exposing it as a primitive could serve as a footgun.
-->
