"""Generate Apex Tutoring printable worksheet packs.

Usage:  python3 tools/make_review_packs.py [seed]   (the 6 older mixed-review packs)
Writes worksheets/<pack>.html (print-ready, problems + answer key). Then the PDFs are
made with headless Chrome (see tools/README in START_HERE.md). Change the seed to get a
brand-new set of problems with the same skills.
"""
import html, os, random, sys
from fractions import Fraction
from math import gcd

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
OUT = os.path.join(os.path.dirname(__file__), "..", "worksheets")
NAMES = ["Maya", "Leo", "Ava", "Sam", "Priya", "Noah", "Zoe", "Eli", "Aria", "Kai", "Lily", "Omar"]
THINGS = ["stickers", "marbles", "pencils", "cards", "apples", "books", "stamps", "shells"]


def frac(f):
    f = Fraction(f)
    return str(f.numerator) if f.denominator == 1 else f"{f.numerator}/{f.denominator}"


def neg(n):
    return f"−{abs(n)}" if n < 0 else str(n)


SUP = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def pw(b, e):
    return f"{b}{str(e).translate(SUP)}"


def cx(c):
    """Coefficient of x: 1 -> "x", -1 -> "−x", 3 -> "3x"."""
    return "x" if c == 1 else "−x" if c == -1 else f"{neg(c)}x"


# Each skill: (section title, count, generator(r) -> (question, answer))
def add20(r):
    a = r.randint(3, 12); b = r.randint(2, 20 - a); return f"{a} + {b} =", a + b
def sub20(r):
    a = r.randint(10, 20); b = r.randint(2, 9); return f"{a} − {b} =", a - b
def place(r):
    t, o = r.randint(1, 9), r.randint(0, 9)
    return f"{t} ten{'s' if t != 1 else ''} and {o} one{'s' if o != 1 else ''} = ____", 10 * t + o
def compare(r):
    a, b = r.randint(10, 99), r.randint(10, 99)
    return f"{a}  ___  {b}   (write <, >, or =)", "<" if a < b else ">" if a > b else "="
def word12(r):
    n = r.choice(NAMES); t = r.choice(THINGS); a, b = r.randint(5, 12), r.randint(2, 8)
    if r.random() < .5: return f"{n} has {a} {t}. A friend gives {n} {b} more. How many {t} now?", a + b
    return f"{n} has {a + b} {t} and gives away {b}. How many are left?", a
def mult(r):
    a, b = r.randint(2, 10), r.randint(2, 10); return f"{a} × {b} =", a * b
def div(r):
    b, q = r.randint(2, 10), r.randint(2, 10); return f"{b * q} ÷ {b} =", q
def area(r):
    l, w = r.randint(3, 12), r.randint(2, 9)
    if r.random() < .5: return f"Area of a rectangle {l} cm by {w} cm = ____ square cm", l * w
    return f"Perimeter of a rectangle {l} m by {w} m = ____ m", 2 * (l + w)
def rounding(r):
    if r.random() < .5:
        n = r.randint(11, 99); return f"Round {n} to the nearest ten:", (n + 5) // 10 * 10
    n = r.randint(101, 999); return f"Round {n} to the nearest hundred:", (n // 100 + (1 if n % 100 >= 50 else 0)) * 100
def word3(r):
    n = r.choice(NAMES); t = r.choice(THINGS); g, e = r.randint(3, 8), r.randint(3, 9)
    if r.random() < .5: return f"{n} has {g} bags with {e} {t} in each. How many {t} in all?", g * e
    return f"{n} shares {g * e} {t} equally among {g} friends. How many does each friend get?", e
def eqfrac(r):
    n, d = r.choice([(1, 2), (1, 3), (2, 3), (1, 4), (3, 4), (2, 5), (3, 5)]); k = r.randint(2, 5)
    return f"{n}/{d} = ?/{d * k}", n * k
def addfrac(r):
    d = r.choice([4, 5, 6, 8, 10, 12]); a, b = r.randint(1, d - 2), r.randint(1, d - 1)
    if r.random() < .5 and a + b <= 2 * d: return f"{a}/{d} + {b}/{d} =", frac(Fraction(a + b, d))
    a, b = max(a, b), min(a, b); return f"{a}/{d} − {b}/{d} =", frac(Fraction(a - b, d))
def decimals(r):
    a, b = r.randint(11, 99) / 10, r.randint(105, 495) / 100
    if r.random() < .5: return f"{a:.1f} + {b:.2f} =", f"{a + b:.2f}"
    a = a + 5; return f"{a:.1f} − {b:.2f} =", f"{a - b:.2f}"
def multidigit(r):
    a, b = r.randint(12, 99), r.randint(3, 9) if r.random() < .5 else r.randint(11, 29); return f"{a} × {b} =", a * b
def longdiv(r):
    d, q = r.randint(3, 9), r.randint(21, 99); return f"{d * q} ÷ {d} =", q
def word45(r):
    n = r.choice(NAMES); p = r.choice([0.25, 0.5, 0.75, 1.25, 1.5]); k = r.randint(3, 8)
    return f"{n} buys {k} pens that cost ${p:.2f} each. What is the total cost?", f"${p * k:.2f}"
def percent(r):
    p, step = r.choice([(10, 10), (20, 5), (25, 4), (50, 2), (75, 4), (30, 10)]); N = step * r.randint(3, 15)
    return f"{p}% of {N} =", p * N // 100
def integers(r):
    a, b = r.randint(-15, 15), r.randint(-12, 12)
    op = r.choice(["+", "−", "×"])
    val = a + b if op == "+" else a - b if op == "−" else a * b
    return f"({neg(a)}) {op} ({neg(b)}) =", neg(val)
def rates(r):
    n = r.choice(NAMES); unit = r.randint(2, 9); k = r.randint(3, 8)
    return f"{n} reads {unit * k} pages in {k} days at the same rate. How many pages per day?", unit
def equations(r):
    x = r.randint(-6, 12); a = r.randint(2, 7); b = r.randint(-10, 15)
    sign = "+" if b >= 0 else "−"
    return f"Solve: {a}x {sign} {abs(b)} = {neg(a * x + b)}", f"x = {neg(x)}"
def word67(r):
    price = r.choice([20, 40, 50, 60, 80]); off = r.choice([10, 25, 50])
    return f"A ${price} game is {off}% off. What is the sale price?", f"${price - price * off // 100}"
def slope(r):
    x1, y1 = r.randint(-3, 3), r.randint(-4, 4); dx = r.randint(1, 4); m = r.choice([-3, -2, -1, 2, 3, 4])
    return f"Slope through ({neg(x1)}, {neg(y1)}) and ({neg(x1 + dx)}, {neg(y1 + m * dx)}) =", neg(m)
def exponents(r):
    b, m, n = r.randint(2, 5), r.randint(2, 5), r.randint(2, 4)
    k = r.randint(0, 2)
    if k == 0: return f"{pw(b, m)} × {pw(b, n)} = {b}ⁿ,  n =", m + n
    if k == 1: return f"({pw(b, m)}){str(n).translate(SUP)} = {b}ⁿ,  n =", m * n
    return f"{pw(b, m + n)} ÷ {pw(b, n)} = {b}ⁿ,  n =", m
def pythag(r):
    a, b, c = r.choice([(3, 4, 5), (6, 8, 10), (5, 12, 13), (8, 15, 17), (9, 12, 15), (12, 16, 20), (7, 24, 25)])
    if r.random() < .5: return f"Right triangle legs {a} and {b}. Hypotenuse =", c
    return f"Right triangle hypotenuse {c}, one leg {a}. Other leg =", b
def multistep(r):
    x = r.randint(-5, 9); a = r.randint(2, 5); b = r.randint(1, 9); c = r.randint(1, a - 1) if a > 2 else 1
    rhs = (a - c) * x + b
    return f"Solve: {cx(a)} + {b} = {cx(c)} {'+' if rhs >= 0 else '−'} {abs(rhs)}", f"x = {neg(x)}"
def scinot(r):
    m = r.randint(11, 99) / 10; e = r.randint(3, 7)
    if r.random() < .5: return f"Write {m * 10 ** e:,.0f} in scientific notation:", f"{m} × {pw(10, e)}"
    return f"Write {m} × {pw(10, e)} as a regular number:", f"{m * 10 ** e:,.0f}"
def functions(r):
    m, b, x = r.choice([-4, -3, -2, -1, 2, 3, 4, 5]), r.randint(-6, 6), r.randint(-3, 5)
    tail = "" if b == 0 else f" {'+' if b > 0 else '−'} {abs(b)}"
    return f"If f(x) = {cx(m)}{tail}, find f({neg(x)})", neg(m * x + b)

COMPETITION = [
    ("What is 1 + 2 + 3 + … + 100?", "5050"),
    ("6 friends each shake hands with every other friend once. How many handshakes?", "15"),
    ("What is the ones digit of 2¹⁰?", "4"),
    ("How many two-digit numbers have digits that add up to 9?", "9"),
    ("A shirt costs $20 more than a hat. Together they cost $50. How much is the hat?", "$15"),
    ("What is the smallest number greater than 1 that leaves a remainder of 1 when divided by 2, 3, and 4?", "13"),
    ("How many squares of any size are on a 3 × 3 grid?", "14"),
    ("I'm thinking of a number. Double it, add 6, and you get 30. What's my number?", "12"),
    ("What is the sum of the angles inside a pentagon?", "540°"),
    ("A clock shows 3:00. What is the smaller angle between the hands?", "90°"),
    ("How many ways can you arrange the letters A, B, C in a row?", "6"),
    ("The average of 4 numbers is 10. Three of them are 8, 9, and 12. What is the fourth?", "11"),
]

PACKS = [
    ("grades-1-2", "Grades 1–2", "Number foundations", [("Addition within 20", 6, add20), ("Subtraction within 20", 6, sub20), ("Place value", 4, place), ("Compare numbers", 4, compare), ("Word problems", 4, word12)]),
    ("grade-3", "Grade 3", "Multiply, divide & measure", [("Multiplication facts", 8, mult), ("Division facts", 6, div), ("Area & perimeter", 4, area), ("Rounding", 4, rounding), ("Word problems", 4, word3)]),
    ("grades-4-5", "Grades 4–5", "Fractions, decimals & big numbers", [("Equivalent fractions", 4, eqfrac), ("Add & subtract fractions", 5, addfrac), ("Decimals", 5, decimals), ("Multi-digit multiplication", 4, multidigit), ("Long division", 4, longdiv), ("Word problems", 3, word45)]),
    ("grades-6-7", "Grades 6–7", "Percents, integers & equations", [("Percents", 5, percent), ("Integers", 6, integers), ("Rates", 3, rates), ("Equations", 6, equations), ("Word problems", 3, word67)]),
    ("pre-algebra", "Pre-Algebra", "Ready for Algebra 1", [("Slope", 4, slope), ("Exponent rules", 5, exponents), ("Pythagorean theorem", 4, pythag), ("Multi-step equations", 5, multistep), ("Scientific notation", 4, scinot), ("Functions", 3, functions)]),
]

CSS = """
@page{size:letter;margin:.55in}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;color:#1d2a3b;background:#eef3f8}
.sheet{background:white;width:8.5in;min-height:11in;margin:20px auto;padding:.55in;box-shadow:0 8px 30px rgba(20,36,58,.12)}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #14243a;padding-bottom:10px;margin-bottom:12px}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.06em;color:#14243a}.brand img{width:38px;height:38px}
.title{text-align:right}.title b{display:block;font-size:20px;color:#14243a}.title span{font-size:12px;color:#5b6b80}
.meta{display:flex;gap:28px;font-size:13px;margin:8px 0 14px}.meta span{flex:1;border-bottom:1px solid #9aa8b8;padding-bottom:2px}
h2{font-size:14px;color:#315f91;text-transform:uppercase;letter-spacing:.08em;margin:12px 0 6px;border-left:4px solid #f3c969;padding-left:8px}
ol{margin:0;padding-left:26px;display:grid;grid-template-columns:1fr 1fr;column-gap:28px;row-gap:6px;font-size:14px}
ol.wide{grid-template-columns:1fr}
li{padding-bottom:13px;border-bottom:1px dashed #d8e1ea}
.key ol li{padding-bottom:4px;border-bottom:0}.key li b{color:#2f7d66}
.foot{margin-top:18px;font-size:11px;color:#7a889a;text-align:center}
.tip{background:#fff8e6;border-left:4px solid #f3c969;padding:8px 10px;font-size:12px;margin-top:8px}
.printbar{max-width:8.5in;margin:16px auto 0;display:flex;gap:10px;justify-content:flex-end}
.printbar a,.printbar button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:10px 16px;background:#14243a;color:white;cursor:pointer;text-decoration:none}
.printbar a.light{background:white;color:#14243a;border:1px solid #d8e1ea}
@media print{body{background:white}.sheet{margin:0;box-shadow:none;width:auto;min-height:auto;padding:0;page-break-after:always}.sheet:last-child{page-break-after:auto}.printbar{display:none}}
"""


def page(title, sub, sections, key=False):
    body = []
    n = 1
    for sec, items in sections:
        wide = any(len(q) > 46 for q, _ in items)
        lis = "".join(
            f'<li value="{n + i}">{html.escape(q)}' + (f' <b>{html.escape(str(a))}</b>' if key else "") + "</li>"
            for i, (q, a) in enumerate(items))
        body.append(f'<h2>{html.escape(sec)}</h2><ol class="{"wide" if wide else ""}" start="{n}">{lis}</ol>')
        n += len(items)
    head = f'''<div class="head"><div class="brand"><img src="../logo.svg" alt="">APEX TUTORING</div>
<div class="title"><b>{html.escape(title)}{" · Answer key" if key else ""}</b><span>{html.escape(sub)}</span></div></div>'''
    meta = "" if key else '<div class="meta"><span>Name:</span><span>Date:</span><span>Score: ____ / ' + str(n - 1) + "</span></div>"
    tip = "" if key else '<div class="tip">Show your work! Stuck on one? Skip it and come back. That\'s a real test strategy.</div>'
    return f'<section class="sheet{" key" if key else ""}">{head}{meta}{tip}{"".join(body)}<div class="foot">© Apex Tutoring · apex-tutoring.github.io · Free to print for personal use</div></section>'


def build(slug, title, sub, sections):
    pdf = f"{slug}.pdf"
    doc = f'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} Worksheet | Apex Tutoring</title><meta name="robots" content="noindex"><link rel="icon" href="../logo.svg"><style>{CSS}</style></head><body>
<div class="printbar"><a class="light" href="../portal.html">← Portal</a><a class="light" href="{pdf}" download>Download PDF</a><button onclick="print()">Print</button></div>
{page(title, sub, sections)}{page(title, sub, sections, key=True)}</body></html>'''
    with open(os.path.join(OUT, f"{slug}.html"), "w") as f:
        f.write(doc)


def main():
    os.makedirs(OUT, exist_ok=True)
    r = random.Random(SEED)
    for slug, title, sub, skills in PACKS:
        sections = []
        for sec, count, gen in skills:
            seen, items = set(), []
            while len(items) < count:
                q, a = gen(r)
                if q not in seen:
                    seen.add(q); items.append((q, a))
            sections.append((sec, items))
        build(slug, title, sub, sections)
    build("competition", "Competition Math", "Challenge problems · Grades 4–8", [("Challenge problems", COMPETITION)])
    print("wrote", len(PACKS) + 1, "packs to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
