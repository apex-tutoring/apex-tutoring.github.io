"""Apex Tutoring curriculum + worksheet generator.

Usage:  python3 tools/make_curriculum.py

* Grades 1–7 and Pre-Algebra follow Khan Academy's course units (titles and order taken from
  khanacademy.org/math/<course>, Nov 2026). Competition Math is Apex's own curriculum.
* For every unit it writes two printable worksheets (Practice A and Practice B, each with an
  answer key) to worksheets/<course>-uNN-a.html / -b.html.
* It also writes curriculum.js, which the Student Portal uses for the Curriculum list,
  for assigning worksheets, and for the Khan Academy practice links.
Re-run after changing anything here; problems are random but repeatable (seeded by unit).
"""
import html, json, os, random
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction as Fr

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "worksheets")
KA = "https://www.khanacademy.org/math/"
NAMES = ["Maya", "Leo", "Ava", "Sam", "Priya", "Noah", "Zoe", "Eli", "Aria", "Kai", "Lily", "Omar", "Nina", "Jay"]
THINGS = ["stickers", "marbles", "pencils", "cards", "apples", "books", "stamps", "shells", "beads", "cookies"]

# ---------------------------------------------------------------- helpers
def fs(f):
    f = Fr(f)
    return str(f.numerator) if f.denominator == 1 else f"{f.numerator}/{f.denominator}"
def mixed(f):
    f = Fr(f)
    if f.denominator == 1: return str(f.numerator)
    sign = "−" if f < 0 else ""; f = abs(f)
    w, r = divmod(f.numerator, f.denominator)
    return f"{sign}{w} {r}/{f.denominator}" if w else f"{sign}{r}/{f.denominator}"
def neg(n): return f"−{abs(n)}" if n < 0 else str(n)
def dec(x, places=None):
    d = Decimal(str(x))
    if places is not None: d = d.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    s = format(d.normalize(), "f")
    return s if "." not in s else s.rstrip("0").rstrip(".")
def num(n): return f"{n:,}"
def money(cents): return f"${cents / 100:.2f}"
SUP = str.maketrans("0123456789-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻")
def pw(b, e): return f"{b}{str(e).translate(SUP)}"
def cx(c, v="x"): return v if c == 1 else f"−{v}" if c == -1 else f"{neg(c)}{v}"
def sym(a, b): return "<" if a < b else ">" if a > b else "="
def rnd(n, to): return (n + to // 2) // to * to
def pick(r, bank): return r.choice(bank)

# ---------------------------------------------------------------- Grade 1
def g1_tens(r):
    t, o = r.randint(1, 9), r.randint(0, 9)
    return f"{t} tens and {o} ones = ____", 10 * t + o
def g1_tenmore(r):
    n = r.randint(10, 89)
    return (f"What is 10 more than {n}?", n + 10) if r.random() < .5 else (f"What is 10 less than {n}?", n - 10)
def g1_compare(r):
    a, b = r.randint(10, 99), r.randint(10, 99)
    return f"{a}  ___  {b}   (write <, >, or =)", sym(a, b)
def g1_add(r):
    a = r.randint(2, 12); b = r.randint(1, 20 - a); return f"{a} + {b} =", a + b
def g1_sub(r):
    a = r.randint(8, 20); b = r.randint(1, min(9, a)); return f"{a} − {b} =", a - b
def g1_missing(r):
    a = r.randint(2, 10); c = r.randint(a + 1, 20); return f"{a} + ___ = {c}", c - a
def g1_word(r):
    n, t, a, b = r.choice(NAMES), r.choice(THINGS), r.randint(4, 12), r.randint(2, 8)
    if r.random() < .5: return f"{n} has {a} {t} and gets {b} more. How many {t} now?", a + b
    return f"{n} has {a + b} {t} and gives away {b}. How many are left?", a
def g1_length(r):
    a, b = r.randint(5, 12), r.randint(2, 4)
    return f"A pencil is {a} paper clips long. A crayon is {a - b} paper clips long. How many paper clips longer is the pencil?", b
def g1_time(r):
    h = r.randint(1, 11)
    if r.random() < .5: return f"The hour hand points to {h} and the minute hand points to 12. What time is it?", f"{h}:00"
    return f"The hour hand is halfway between {h} and {h + 1}. The minute hand points to 6. What time is it?", f"{h}:30"
def g1_shape(r):
    s, n = r.choice([("triangle", 3), ("rectangle", 4), ("square", 4), ("pentagon", 5), ("hexagon", 6)])
    return (f"How many sides does a {s} have?", n) if r.random() < .5 else (f"How many corners (vertices) does a {s} have?", n)
def g1_data(r):
    a, b = r.randint(5, 12), r.randint(1, 6)
    f1, f2 = r.sample(["apples", "bananas", "grapes", "oranges", "pears"], 2)
    if r.random() < .5: return f"In a class vote, {a} kids chose {f1} and {b} chose {f2}. How many more chose {f1}?", a - b
    return f"In a class vote, {a} kids chose {f1} and {b} chose {f2}. How many kids voted in all?", a + b

# ---------------------------------------------------------------- Grade 2
def g2_expanded(r):
    h, t, o = r.randint(1, 9), r.randint(0, 9), r.randint(0, 9); n = 100 * h + 10 * t + o
    parts = [str(x) for x in (100 * h, 10 * t, o) if x]
    return f"Write {n} in expanded form.", " + ".join(parts)
def g2_digit(r):
    n = r.randint(100, 999); s = str(n); i = r.randint(0, 2); d = s[i]
    while s.count(d) > 1: n = r.randint(100, 999); s = str(n); d = s[i]
    return f"What is the value of the {d} in {n}?", int(d) * 10 ** (2 - i)
def g2_skip(r):
    step = r.choice([5, 10, 100]); start = step * r.randint(1, 8)
    seq = [start + step * k for k in range(4)]
    return f"Skip count by {step}s: {', '.join(map(str, seq[:3]))}, ___", seq[3]
def g2_compare3(r):
    a, b = r.randint(100, 999), r.randint(100, 999); return f"{a}  ___  {b}   (write <, >, or =)", sym(a, b)
def g2_add100(r):
    a, b = r.randint(15, 60), r.randint(15, 39); return f"{a} + {b} =", a + b
def g2_sub100(r):
    a = r.randint(40, 99); b = r.randint(11, a - 5); return f"{a} − {b} =", a - b
def g2_add1000(r):
    a, b = r.randint(120, 600), r.randint(110, 390); return f"{a} + {b} =", a + b
def g2_sub1000(r):
    a = r.randint(300, 999); b = r.randint(105, a - 50); return f"{a} − {b} =", a - b
def g2_coins(r):
    q, d, n, p = r.randint(0, 3), r.randint(0, 4), r.randint(0, 3), r.randint(0, 4)
    if q + d + n + p == 0: q = 1
    return f"{q} quarters, {d} dimes, {n} nickels, and {p} pennies = ____ ¢", 25 * q + 10 * d + 5 * n + p
def g2_change(r):
    c = r.randint(15, 95); return f"You pay $1.00 for a toy that costs {c}¢. How much change do you get?", f"{100 - c}¢"
def g2_clock(r):
    h, k = r.randint(1, 11), r.randint(1, 11)
    return f"The hour hand is just past {h} and the minute hand points to {k}. What time is it?", f"{h}:{5 * k:02d}"
def g2_ampm(r):
    return pick(r, [("Is lunchtime at 12:30 AM or 12:30 PM?", "PM"), ("You eat breakfast at 7:00. AM or PM?", "AM"),
                    ("You go to bed at 8:30 at night. AM or PM?", "PM"), ("The sun rises at 6:15. AM or PM?", "AM"),
                    ("School ends at 3:00 in the afternoon. AM or PM?", "PM")])
def g2_lengthdiff(r):
    a = r.randint(20, 90); b = r.randint(5, a - 5); u = r.choice(["cm", "inches"])
    return f"A red ribbon is {a} {u} long. A blue ribbon is {b} {u} long. How much longer is the red ribbon?", f"{a - b} {u}"
def g2_estimate(r):
    return pick(r, [("Better estimate for a pencil's length: 15 cm or 15 m?", "15 cm"), ("Better estimate for a door's height: 2 m or 2 cm?", "2 m"),
                    ("Better estimate for a crayon's length: 3 inches or 3 feet?", "3 inches"), ("Better estimate for a car's length: 4 m or 4 cm?", "4 m"),
                    ("Better estimate for a book's width: 8 inches or 8 yards?", "8 inches")])
def g2_bar(r):
    a, b, c = r.randint(3, 12), r.randint(3, 12), r.randint(3, 12)
    k = r.randint(0, 2)
    if k == 0: return f"Votes — Soccer: {a}, Tennis: {b}, Swimming: {c}. How many votes in all?", a + b + c
    hi, lo = max(a, b), min(a, b)
    return f"Votes — Soccer: {a}, Tennis: {b}. How many more votes did the winner get?", hi - lo
def g2_shapes(r):
    return pick(r, [("How many faces does a cube have?", 6), ("How many vertices does a triangle have?", 3), ("How many sides does a pentagon have?", 5),
                    ("How many sides does a hexagon have?", 6), ("How many angles does a quadrilateral have?", 4), ("How many edges does a cube have?", 12)])
def g2_shares(r):
    n, w = r.choice([(2, "half"), (3, "third"), (4, "fourth (or quarter)")])
    return f"A pizza is cut into {n} equal pieces. Each piece is called one ____.", w

# ---------------------------------------------------------------- Grade 3
def g3_groups(r):
    g, n = r.randint(2, 6), r.randint(2, 9)
    if r.random() < .5: return f"{g} groups of {n} = ____", g * n
    return f"Write {' + '.join([str(n)] * g)} as a multiplication.", f"{g} × {n}"
def g3_mult(r):
    a, b = r.randint(2, 10), r.randint(2, 10); return f"{a} × {b} =", a * b
def g3_mult01(r):
    a = r.randint(2, 50); z = r.choice([0, 1]); return (f"{a} × {z} =", a * z) if r.random() < .5 else (f"{z} × {a} =", a * z)
def g3_add3(r):
    a, b = r.randint(150, 600), r.randint(120, 399)
    return (f"{a} + {b} =", a + b) if r.random() < .5 else (f"{a + b} − {b} =", a)
def g3_round(r):
    if r.random() < .5:
        n = r.randint(11, 989); return f"Round {n} to the nearest ten:", rnd(n, 10)
    n = r.randint(110, 989); return f"Round {n} to the nearest hundred:", rnd(n, 100)
def g3_estimate(r):
    a, b = r.randint(110, 480), r.randint(110, 480)
    return f"Estimate {a} + {b} by rounding each number to the nearest hundred.", rnd(a, 100) + rnd(b, 100)
def g3_share(r):
    k, q = r.randint(2, 9), r.randint(2, 9); t = r.choice(THINGS)
    return f"{k * q} {t} are shared equally by {k} kids. How many does each kid get?", q
def g3_divfact(r):
    b, q = r.randint(2, 10), r.randint(2, 10); return f"{b * q} ÷ {b} =", q
def g3_fracshade(r):
    d = r.choice([2, 3, 4, 6, 8]); s = r.randint(1, d - 1)
    return f"A rectangle is cut into {d} equal parts. {s} part{'s' if s > 1 else ''} {'are' if s > 1 else 'is'} shaded. What fraction is shaded?", f"{s}/{d}"
def g3_fracline(r):
    d = r.choice([2, 3, 4, 6, 8]); s = r.randint(1, d - 1)
    return f"A number line from 0 to 1 is split into {d} equal parts. What fraction is at the {s}{'st' if s == 1 else 'nd' if s == 2 else 'rd' if s == 3 else 'th'} mark?", f"{s}/{d}"
def g3_fraccmp(r):
    if r.random() < .5:
        d = r.choice([3, 4, 6, 8]); a, b = r.randint(1, d - 1), r.randint(1, d - 1)
        return f"{a}/{d}  ___  {b}/{d}   (write <, >, or =)", sym(a, b)
    n = r.randint(1, 3); d1, d2 = r.sample([2, 3, 4, 6, 8], 2)
    if n >= min(d1, d2): n = 1
    return f"{n}/{d1}  ___  {n}/{d2}   (write <, >, or =)", sym(Fr(n, d1), Fr(n, d2))
def g3_fraceq(r):
    n, d = r.choice([(1, 2), (1, 3), (2, 3), (1, 4), (3, 4)]); k = r.randint(2, 4)
    return f"{n}/{d} = ?/{d * k}", n * k
def g3_missfactor(r):
    a, b = r.randint(2, 10), r.randint(2, 10); return f"___ × {b} = {a * b}", a
def g3_tens(r):
    a, b = r.randint(2, 9), r.randint(2, 9); return f"{a} × {b * 10} =", a * b * 10
def g3_twostep(r):
    n, t = r.choice(NAMES), r.choice(THINGS); g, e, x = r.randint(3, 6), r.randint(3, 8), r.randint(2, 9)
    return f"{n} has {g} bags with {e} {t} in each, then gets {x} more. How many {t} now?", g * e + x
def g3_oddeven(r):
    n = r.randint(11, 199); return f"Is {n} odd or even?", "even" if n % 2 == 0 else "odd"
def g3_rule(r):
    s, k = r.randint(1, 9), r.randint(2, 6); seq = [s + k * i for i in range(5)]
    return f"Pattern: {', '.join(map(str, seq[:4]))}, ___  What comes next?", seq[4]
def g3_quad(r):
    return pick(r, [("I have 4 equal sides and 4 right angles. What shape am I?", "square"),
                    ("I have 4 right angles. My opposite sides are equal, but not all 4 sides are equal. What am I?", "rectangle"),
                    ("I have 4 equal sides but no right angles. What am I?", "rhombus"),
                    ("I am a quadrilateral with exactly one pair of parallel sides. What am I?", "trapezoid"),
                    ("Is every square also a rectangle? (yes or no)", "yes"), ("Is every rectangle also a square? (yes or no)", "no"),
                    ("How many right angles does a rectangle have?", 4), ("How many sides does every quadrilateral have?", 4)])
def g3_area(r):
    l, w = r.randint(2, 10), r.randint(2, 9)
    if r.random() < .6: return f"Area of a rectangle {l} units long and {w} units wide = ____ square units", l * w
    a, b, c, d = r.randint(2, 6), r.randint(2, 5), r.randint(2, 6), r.randint(2, 5)
    return f"An L-shape is made of a {a} × {b} rectangle and a {c} × {d} rectangle. What is its total area?", f"{a * b + c * d} square units"
def g3_perim(r):
    l, w = r.randint(3, 15), r.randint(2, 10)
    if r.random() < .6: return f"Perimeter of a rectangle {l} cm long and {w} cm wide = ____ cm", 2 * (l + w)
    return f"A rectangle has a perimeter of {2 * (l + w)} cm and a length of {l} cm. What is its width?", f"{w} cm"
def g3_elapsed(r):
    h, m = r.randint(1, 10), r.choice([0, 5, 10, 15, 20, 30, 40, 45]); add = r.choice([15, 20, 25, 30, 35, 40, 45, 50])
    t = h * 60 + m + add; eh, em = divmod(t, 60); eh = eh if eh <= 12 else eh - 12
    return f"A movie starts at {h}:{m:02d} and lasts {add} minutes. What time does it end?", f"{eh}:{em:02d}"
def g3_mass(r):
    if r.random() < .5:
        a, b = r.randint(2, 15), r.randint(2, 15); return f"A bag of apples has a mass of {a} kg. A bag of oranges has a mass of {b} kg. What is the total mass?", f"{a + b} kg"
    return pick(r, [("A paper clip has a mass of about 1 ___ (g or kg)", "g"), ("A big dog has a mass of about 30 ___ (g or kg)", "kg"),
                    ("A large water bottle holds about 1 ___ (mL or L)", "L"), ("A spoon holds about 5 ___ (mL or L)", "mL")])
def g3_picture(r):
    k, s1, s2 = r.choice([2, 5, 10]), r.randint(2, 8), r.randint(1, 7)
    if r.random() < .5: return f"In a picture graph, each ⭐ = {k} books. Mia has {s1} ⭐. How many books did Mia read?", s1 * k
    hi, lo = max(s1, s2), min(s1, s2)
    return f"Each ⭐ = {k} books. Mia has {hi} ⭐ and Leo has {lo} ⭐. How many more books did Mia read?", (hi - lo) * k

# ---------------------------------------------------------------- Grade 4
def g4_round(r):
    if r.random() < .5:
        n = r.randint(1100, 98999); return f"Round {num(n)} to the nearest thousand:", num(rnd(n, 1000))
    n = r.randint(11000, 989999); return f"Round {num(n)} to the nearest ten thousand:", num(rnd(n, 10000))
def g4_digitval(r):
    n = r.randint(100000, 999999); s = str(n); i = r.randint(0, 5); d = s[i]
    while d == "0" or s.count(d) > 1: n = r.randint(100000, 999999); s = str(n); d = s[i]
    return f"What is the value of the {d} in {num(n)}?", num(int(d) * 10 ** (5 - i))
def g4_addsub(r):
    a, b = r.randint(1200, 60000), r.randint(1100, 39000)
    return (f"{num(a)} + {num(b)} =", num(a + b)) if r.random() < .5 else (f"{num(a + b)} − {num(b)} =", num(a))
def g4_m1(r):
    a, b = r.randint(120, 4999), r.randint(2, 9); return f"{num(a)} × {b} =", num(a * b)
def g4_m2(r):
    a, b = r.randint(11, 99), r.randint(11, 99); return f"{a} × {b} =", num(a * b)
def g4_div(r):
    d = r.randint(2, 9); q = r.randint(12, 999); rem = r.randint(0, d - 1)
    return f"{num(d * q + rem)} ÷ {d} =", f"{q}" + (f" R{rem}" if rem else "")
def g4_factors(r):
    n = r.choice([12, 16, 18, 20, 24, 28, 30, 36, 40, 42, 48])
    pairs = [f"{a} × {n // a}" for a in range(1, int(n ** .5) + 1) if n % a == 0]
    return f"List all the factor pairs of {n}.", ", ".join(pairs)
def g4_prime(r):
    n = r.randint(2, 60); p = n > 1 and all(n % k for k in range(2, int(n ** .5) + 1))
    return f"Is {n} prime or composite?", "prime" if p else "composite"
def g4_isfactor(r):
    a = r.randint(3, 9); n = a * r.randint(3, 12) + r.choice([0, 0, 1, 2])
    return f"Is {a} a factor of {n}? (yes or no)", "yes" if n % a == 0 else "no"
def g4_eqfrac(r):
    n, d = r.choice([(1, 2), (2, 3), (3, 4), (2, 5), (3, 5), (5, 6), (3, 8)]); k = r.randint(2, 5)
    return f"{n}/{d} = ?/{d * k}", n * k
def g4_cmpfrac(r):
    a, b = Fr(r.randint(1, 5), r.choice([6, 8, 10, 12])), Fr(r.randint(1, 3), r.choice([2, 3, 4, 5]))
    return f"{fs(a) if a.denominator != 1 else a}  ___  {fs(b)}   (write <, >, or =)", sym(a, b)
def g4_addfrac(r):
    d = r.choice([4, 5, 6, 8, 10, 12]); a, b = r.randint(1, d - 1), r.randint(1, d - 1)
    if r.random() < .5: return f"{a}/{d} + {b}/{d} =", mixed(Fr(a + b, d))
    w1, w2 = r.randint(2, 6), r.randint(1, 3); a, b = max(a, b), min(a, b)
    return f"{w1} {a}/{d} − {w2} {b}/{d} =", mixed(Fr(w1 * d + a, d) - Fr(w2 * d + b, d))
def g4_mulfrac(r):
    w, n, d = r.randint(2, 6), r.randint(1, 4), r.choice([3, 4, 5, 6, 8])
    n = min(n, d - 1); return f"{w} × {n}/{d} =", mixed(Fr(w * n, d))
def g4_dec(r):
    k = r.randint(0, 2)
    if k == 0: n = r.randint(1, 99); return f"Write {n}/100 as a decimal.", dec(Fr(n, 100).numerator / Fr(n, 100).denominator)
    if k == 1: a, b = r.randint(1, 9) / 10, r.randint(10, 99) / 100; return f"{dec(a)}  ___  {dec(b)}   (write <, >, or =)", sym(a, b)
    a, b = r.randint(1, 9), r.randint(1, 99); return f"{a}/10 + {b}/100 = ?/100", 10 * a + b
def g4_angletype(r):
    a = r.choice([r.randint(10, 85), 90, r.randint(95, 175), 180])
    t = "acute" if a < 90 else "right" if a == 90 else "obtuse" if a < 180 else "straight"
    return f"An angle measures {a}°. Is it acute, right, obtuse, or straight?", t
def g4_symmetry(r):
    return pick(r, [("How many lines of symmetry does a square have?", 4), ("How many lines of symmetry does a (non-square) rectangle have?", 2),
                    ("How many lines of symmetry does an equilateral triangle have?", 3), ("Do parallel lines ever cross? (yes or no)", "no"),
                    ("Perpendicular lines meet at what kind of angle?", "right angle (90°)"), ("How many lines of symmetry does a regular hexagon have?", 6)])
def g4_angles(r):
    k = r.randint(0, 2)
    if k == 0: a = r.randint(20, 160); return f"Two angles make a straight line. One is {a}°. What is the other?", f"{180 - a}°"
    if k == 1: a = r.randint(10, 80); return f"A right angle is split into two angles. One is {a}°. What is the other?", f"{90 - a}°"
    t, d = r.choice([("1/4", 90), ("1/2", 180), ("3/4", 270), ("full", 360)]); return f"How many degrees is a {t} turn?", f"{d}°"
def g4_ap(r):
    l, w = r.randint(4, 20), r.randint(3, 15)
    k = r.randint(0, 2)
    if k == 0: return f"Area of a rectangle {l} m by {w} m =", f"{l * w} square m"
    if k == 1: return f"Perimeter of a rectangle {l} m by {w} m =", f"{2 * (l + w)} m"
    return f"A rectangle has an area of {l * w} square ft and a width of {w} ft. What is its length?", f"{l} ft"
def g4_units(r):
    a, u1, u2, f = r.choice([(r.randint(2, 9), "feet", "inches", 12), (r.randint(2, 9), "yards", "feet", 3), (r.randint(2, 9), "meters", "centimeters", 100),
                             (r.randint(2, 9), "kilometers", "meters", 1000), (r.randint(2, 9), "kilograms", "grams", 1000), (r.randint(2, 9), "liters", "milliliters", 1000),
                             (r.randint(2, 9), "hours", "minutes", 60), (r.randint(2, 6), "pounds", "ounces", 16)])
    return f"{a} {u1} = ____ {u2}", num(a * f)

# ---------------------------------------------------------------- Grade 5
def g5_decval(r):
    n = Decimal(r.randint(1001, 9999)) / 1000; s = format(n, "f"); i = r.choice([2, 3, 4])
    while s[i] == "0" or s.count(s[i]) > 1: n = Decimal(r.randint(1001, 9999)) / 1000; s = format(n, "f")
    return f"What is the value of the {s[i]} in {s}?", dec(Decimal(s[i]) / Decimal(10) ** (i - 1))
def g5_decround(r):
    n = Decimal(r.randint(1001, 9999)) / 1000; p = r.choice([1, 2])
    return f"Round {format(n, 'f')} to the nearest {'tenth' if p == 1 else 'hundredth'}:", format(n.quantize(Decimal(1).scaleb(-p), rounding=ROUND_HALF_UP), "f")
def g5_deccmp(r):
    a, b = Decimal(r.randint(100, 999)) / 100, Decimal(r.randint(1000, 9999)) / 1000
    return f"{format(a, 'f')}  ___  {format(b, 'f')}   (write <, >, or =)", sym(a, b)
def g5_adddec(r):
    a, b = Decimal(r.randint(105, 999)) / 100, Decimal(r.randint(11, 99)) / 10
    return f"{format(a, 'f')} + {format(b, 'f')} =", format(a + b, "f")
def g5_subdec(r):
    a, b = Decimal(r.randint(500, 999)) / 100, Decimal(r.randint(11, 49)) / 10
    return f"{format(a, 'f')} − {format(b, 'f')} =", format(a - b, "f")
def g5_addfrac(r):
    d1, d2 = r.sample([2, 3, 4, 5, 6, 8, 10], 2); a, b = Fr(r.randint(1, d1 - 1), d1), Fr(r.randint(1, d2 - 1), d2)
    if r.random() < .5: return f"{fs(a)} + {fs(b)} =", mixed(a + b)
    hi, lo = max(a, b), min(a, b)
    if hi == lo: return f"{fs(a)} + {fs(b)} =", mixed(a + b)
    return f"{fs(hi)} − {fs(lo)} =", mixed(hi - lo)
def g5_mult(r):
    a, b = r.randint(120, 999), r.randint(12, 99); return f"{a} × {b} =", num(a * b)
def g5_div(r):
    d, q = r.randint(12, 49), r.randint(21, 199); return f"{num(d * q)} ÷ {d} =", q
def g5_mulfrac(r):
    a, b = Fr(r.randint(1, 4), r.choice([2, 3, 4, 5, 6])), Fr(r.randint(1, 5), r.choice([3, 4, 6, 8]))
    if a >= 1: a = Fr(1, a.denominator)
    if b >= 1: b = Fr(1, b.denominator)
    if r.random() < .3:
        l, w = Fr(r.randint(1, 3), 4), Fr(r.randint(1, 2), 3); return f"A rectangle is {fs(l)} m long and {fs(w)} m wide. What is its area?", f"{fs(l * w)} square m"
    return f"{fs(a)} × {fs(b)} =", fs(a * b)
def g5_divfrac(r):
    if r.random() < .5:
        d, w = r.randint(2, 6), r.randint(2, 5); return f"1/{d} ÷ {w} =", f"1/{d * w}"
    w, d = r.randint(2, 8), r.randint(2, 6); return f"{w} ÷ 1/{d} =", w * d
def g5_muldec(r):
    if r.random() < .5:
        a, w = Decimal(r.randint(11, 99)) / 10, r.randint(2, 9); return f"{format(a, 'f')} × {w} =", dec(a * w)
    a, b = Decimal(r.randint(11, 49)) / 10, Decimal(r.randint(2, 9)) / 10; return f"{format(a, 'f')} × {format(b, 'f')} =", dec(a * b)
def g5_divdec(r):
    if r.random() < .5:
        w, q = r.randint(2, 9), Decimal(r.randint(11, 99)) / 10; return f"{format(q * w, 'f')} ÷ {w} =", dec(q)
    w, d = r.randint(2, 9), Decimal(r.choice([5, 2, 25])) / (10 if r.random() < .7 else 100)
    return f"{w} ÷ {format(d, 'f')} =", dec(Decimal(w) / d)
def g5_pow10(r):
    k = r.randint(1, 4); n = Decimal(r.randint(12, 999)) / Decimal(r.choice([1, 10, 100]))
    if r.random() < .5: return f"{format(n, 'f')} × 10{str(k).translate(SUP)} =", dec(n * Decimal(10) ** k)
    return f"{format(n, 'f')} ÷ 10{str(k).translate(SUP)} =", dec(n / Decimal(10) ** k)
def g5_volume(r):
    l, w, h = r.randint(2, 10), r.randint(2, 8), r.randint(2, 9)
    if r.random() < .6: return f"Volume of a box {l} cm × {w} cm × {h} cm =", f"{l * w * h} cubic cm"
    a, b = (r.randint(2, 5), r.randint(2, 4), r.randint(2, 4)), (r.randint(2, 5), r.randint(2, 4), r.randint(2, 4))
    return f"A shape is made of a {a[0]}×{a[1]}×{a[2]} box and a {b[0]}×{b[1]}×{b[2]} box. Total volume?", f"{a[0]*a[1]*a[2] + b[0]*b[1]*b[2]} cubic units"
def g5_coord(r):
    x, y = r.randint(1, 9), r.randint(1, 9); k = r.randint(0, 2)
    if k == 0: return f"Start at (0, 0). Move {x} right and {y} up. What point are you at?", f"({x}, {y})"
    if k == 1: return f"What is the y-coordinate of the point ({x}, {y})?", y
    y2 = r.randint(1, 9)
    while y2 == y: y2 = r.randint(1, 9)
    return f"How far apart are the points ({x}, {y}) and ({x}, {y2})?", f"{abs(y - y2)} units"
def g5_orderops(r):
    a, b, c, d = r.randint(2, 9), r.randint(2, 9), r.randint(2, 9), r.randint(1, 9)
    if r.random() < .5: return f"{a} × ({b} + {c}) − {d} =", a * (b + c) - d
    return f"Write an expression: add {a} and {b}, then multiply by {c}.", f"({a} + {b}) × {c}"
def g5_conv(r):
    a = Decimal(r.randint(11, 95)) / 10
    u = r.choice([("m", "cm", 100), ("kg", "g", 1000), ("L", "mL", 1000), ("km", "m", 1000)])
    if r.random() < .7: return f"{format(a, 'f')} {u[0]} = ____ {u[1]}", dec(a * u[2])
    n = r.randint(2, 9) * 12; return f"{n} inches = ____ feet", n // 12
def g5_lineplot(r):
    vals = [Fr(r.choice([1, 2, 3]), 4) for _ in range(6)]
    data = ", ".join(fs(v) for v in vals)
    k = r.randint(0, 1)
    if k == 0: return f"Bug lengths (inches): {data}. What is the total length of all the bugs?", mixed(sum(vals))
    return f"Bug lengths (inches): {data}. How much longer is the longest bug than the shortest?", fs(max(vals) - min(vals))
def g5_triangles(r):
    if r.random() < .5:
        t = r.choice([("3 equal sides", "equilateral"), ("exactly 2 equal sides", "isosceles"), ("no equal sides", "scalene")])
        return f"A triangle has {t[0]}. What kind of triangle is it (by sides)?", t[1]
    a = r.choice([r.randint(20, 80), 90, r.randint(95, 140)]); b = r.randint(15, (180 - a) - 15) if a != 90 else r.randint(20, 70)
    c = 180 - a - b; angs = sorted([a, b, c], reverse=True)
    if angs[0] == 90: t = "right"
    elif angs[0] > 90: t = "obtuse"
    else: t = "acute"
    return f"A triangle has angles of {a}°, {b}°, and {c}°. Is it acute, right, or obtuse?", t
def g5_quadsyes(r):
    return pick(r, [("Is every square a rhombus? (yes or no)", "yes"), ("Is every rhombus a square? (yes or no)", "no"),
                    ("Is every rectangle a parallelogram? (yes or no)", "yes"), ("Is every parallelogram a rectangle? (yes or no)", "no"),
                    ("Is a square a trapezoid under the 'at least one pair of parallel sides' definition? (yes or no)", "yes")])

# ---------------------------------------------------------------- Grade 6
def g6_ratio(r):
    a, b = r.randint(1, 5), r.randint(2, 7)
    while a == b: b = r.randint(2, 7)
    k = r.randint(0, 2)
    if k == 0: m = r.randint(2, 6); return f"{a} : {b} = {a * m} : ?", b * m
    if k == 1: m = r.randint(3, 8); return f"The ratio of boys to girls is {a}:{b}. There are {(a + b) * m} students. How many girls?", b * m
    m = r.randint(2, 5); return f"A recipe uses {a} cups of flour for every {b} cups of sugar. How much flour for {b * m} cups of sugar?", f"{a * m} cups"
def g6_fracdiv(r):
    a, b = Fr(r.randint(1, 5), r.choice([2, 3, 4, 6])), Fr(r.randint(1, 3), r.choice([4, 5, 8]))
    if a == 0 or b == 0: a, b = Fr(1, 2), Fr(1, 4)
    return f"{fs(a)} ÷ {fs(b)} =", mixed(a / b)
def g6_decops(r):
    a, b = Decimal(r.randint(105, 999)) / 100, Decimal(r.randint(2, 9))
    k = r.randint(0, 1)
    if k == 0: return f"{format(a, 'f')} × {b} =", dec(a * b)
    q = Decimal(r.randint(11, 99)) / 100; return f"{format(q * b, 'f')} ÷ {b} =", dec(q)
def g6_unitrate(r):
    n, per = r.randint(2, 8), r.choice([125, 150, 175, 225, 250, 300, 350])
    return f"{n} notebooks cost {money(n * per)}. What is the cost of 1 notebook?", money(per)
def g6_pct(r):
    p, step = r.choice([(10, 10), (20, 5), (25, 4), (50, 2), (75, 4), (40, 5), (5, 20)]); N = step * r.randint(2, 15)
    if r.random() < .5: return f"What is {p}% of {N}?", p * N // 100
    return f"{p * N // 100} is {p}% of what number?", N
def g6_exp(r):
    k = r.randint(0, 1)
    if k == 0: b, e = r.randint(2, 6), r.randint(2, 4); return f"{pw(b, e)} =", b ** e
    a, b, c = r.randint(1, 9), r.randint(2, 4), r.randint(2, 5); return f"{a} + {pw(b, 2)} × {c} =", a + b * b * c
def g6_neg(r):
    k = r.randint(0, 3); a, b = r.randint(-20, 20), r.randint(-20, 20)
    if k == 0: return f"{neg(a)}  ___  {neg(b)}   (write <, >, or =)", sym(a, b)
    if k == 1: return f"|{neg(a)}| =", abs(a)
    if k == 2: return f"What is the opposite of {neg(a)}?", neg(-a)
    t, rise = -r.randint(2, 12), r.randint(3, 20); return f"The temperature is {neg(t)}°F and rises {rise}°. What is the new temperature?", f"{neg(t + rise)}°F"
def g6_varexp(r):
    k = r.randint(0, 2); a, b, x = r.randint(2, 9), r.randint(1, 15), r.randint(2, 10)
    if k == 0: return f"Evaluate {a}x + {b} when x = {x}.", a * x + b
    if k == 1: c, d = r.randint(2, 7), r.randint(1, 5); return f"Simplify: {a}x + {c}x − {d}x", cx(a + c - d)
    return f"Use the distributive property: {a}(x + {b})", f"{a}x + {a * b}"
def g6_eq(r):
    k = r.randint(0, 3); x, a = r.randint(2, 20), r.randint(2, 12)
    if k == 0: return f"Solve: x + {a} = {x + a}", f"x = {x}"
    if k == 1: return f"Solve: {a}x = {a * x}", f"x = {x}"
    if k == 2: return f"Solve: x ÷ {a} = {x}", f"x = {x * a}"
    return f"Solve the inequality: x + {a} > {x + a}", f"x > {x}"
def g6_area(r):
    k = r.randint(0, 2); b, h = r.randint(3, 14), r.randint(2, 12)
    if k == 0:
        if b * h % 2: b += 1
        return f"Area of a triangle with base {b} cm and height {h} cm =", f"{b * h // 2} square cm"
    if k == 1: return f"Area of a parallelogram with base {b} cm and height {h} cm =", f"{b * h} square cm"
    a = r.randint(2, 10); c = a + 2 * r.randint(1, 4); return f"Area of a trapezoid with bases {a} cm and {c} cm and height {h} cm =", f"{(a + c) * h // 2} square cm"
def g6_coord(r):
    x, y = r.choice([-1, 1]) * r.randint(1, 9), r.choice([-1, 1]) * r.randint(1, 9); k = r.randint(0, 2)
    if k == 0: q = "I" if x > 0 and y > 0 else "II" if x < 0 < y else "III" if x < 0 and y < 0 else "IV"; return f"Which quadrant is ({neg(x)}, {neg(y)}) in?", q
    if k == 1: return f"Reflect ({neg(x)}, {neg(y)}) over the x-axis. What is the new point?", f"({neg(x)}, {neg(-y)})"
    y2 = r.choice([-1, 1]) * r.randint(1, 9)
    while y2 == y: y2 = r.choice([-1, 1]) * r.randint(1, 9)
    return f"Distance between ({neg(x)}, {neg(y)}) and ({neg(x)}, {neg(y2)}) =", f"{abs(y - y2)} units"
def g6_3d(r):
    l, w, h = r.randint(2, 9), r.randint(2, 8), r.randint(2, 7)
    if r.random() < .6: return f"Surface area of a rectangular prism {l} × {w} × {h} (cm) =", f"{2 * (l * w + l * h + w * h)} square cm"
    return f"Volume of a prism {l} cm × {w} cm × 1/2 cm =", f"{mixed(Fr(l * w, 2))} cubic cm"
def g6_stats(r):
    n = r.choice([5, 7]); vals = [r.randint(1, 20) for _ in range(n)]
    while sum(vals) % n: vals[-1] += 1
    k = r.randint(0, 2); s = ", ".join(map(str, vals))
    if k == 0: return f"Find the mean of: {s}", sum(vals) // n
    if k == 1: return f"Find the median of: {s}", sorted(vals)[n // 2]
    return f"Find the range of: {s}", max(vals) - min(vals)

# ---------------------------------------------------------------- Grade 7
def g7_prop(r):
    k = r.randint(2, 9); x = r.randint(2, 9)
    if r.random() < .5: return f"y is proportional to x. When x = {x}, y = {k * x}. What is the constant of proportionality?", k
    a, b, m = r.randint(2, 9), r.randint(2, 9), r.randint(2, 6); return f"Solve the proportion: {a}/{b} = x/{b * m}", f"x = {a * m}"
def g7_pct(r):
    k = r.randint(0, 3); p = r.choice([10, 15, 20, 25, 30, 40, 50]); price = r.choice([20, 40, 60, 80, 100, 120])
    if k == 0: return f"A ${price} jacket is {p}% off. What is the sale price?", money(price * (100 - p))
    if k == 1: return f"A meal costs ${price}. You leave a {p}% tip. How much is the tip?", money(price * p)
    if k == 2: new = price * (100 + p) // 100; return f"A price goes from ${price} to ${new}. What is the percent increase?", f"{p}%"
    new = price * (100 - p) // 100; return f"A price goes from ${price} to ${new}. What is the percent decrease?", f"{p}%"
def g7_intaddsub(r):
    a, b = r.randint(-20, 20), r.randint(-20, 20); op = r.choice(["+", "−"])
    return f"({neg(a)}) {op} ({neg(b)}) =", neg(a + b if op == "+" else a - b)
def g7_ratas(r):
    if r.random() < .5:
        a, b = Decimal(r.randint(-99, 99)) / 10, Decimal(r.randint(-99, 99)) / 10
        return f"({neg(float(a)) if a < 0 else dec(a)}) + ({neg(float(b)) if b < 0 else dec(b)}) =", ("−" + dec(-(a + b))) if a + b < 0 else dec(a + b)
    a, b = Fr(-r.randint(1, 5), r.choice([2, 3, 4, 6])), Fr(r.randint(1, 5), r.choice([3, 4, 8]))
    res = a + b; return f"{'−' + fs(-a)} + {fs(b)} =", ("−" + mixed(-res)) if res < 0 else mixed(res)
def g7_negmd(r):
    a, b = r.choice([-1, 1]) * r.randint(2, 12), r.choice([-1, 1]) * r.randint(2, 12)
    if r.random() < .5: return f"({neg(a)}) × ({neg(b)}) =", neg(a * b)
    return f"({neg(a * b)}) ÷ ({neg(b)}) =", neg(a)
def g7_eq(r):
    k = r.randint(0, 2); x, a, b = r.randint(-9, 12), r.randint(2, 9), r.randint(1, 20)
    if k == 0: return f"Solve: {a}x + {b} = {neg(a * x + b)}", f"x = {neg(x)}"
    if k == 1: c = r.randint(2, 6); return f"Simplify: {a}x + {b} + {c}x − {b // 2 + 1}", f"{a + c}x + {b - (b // 2 + 1)}" if b - (b // 2 + 1) else f"{a + c}x"
    x = abs(x) + 1; return f"Solve the inequality: {a}x − {b} < {a * x - b}", f"x < {x}"
def g7_prob(r):
    red, blue, green = r.randint(1, 8), r.randint(1, 8), r.randint(1, 8); t = red + blue + green
    if r.random() < .6: return f"A bag has {red} red, {blue} blue, and {green} green marbles. P(red) = ?", fs(Fr(red, t))
    p = r.choice([(1, 4), (1, 5), (1, 2), (2, 5), (3, 10)]); n = 100
    return f"The probability of winning a game is {p[0]}/{p[1]}. In {n} games, how many wins would you expect?", n * p[0] // p[1]
def g7_scale(r):
    a, b, m = r.randint(1, 4), r.randint(2, 10), r.randint(2, 6)
    if r.random() < .6: return f"On a map, {a} cm = {b} km. How many km is {a * m} cm?", f"{b * m} km"
    return f"A figure is scaled from a side of {a * 2} cm to {a * 2 * m} cm. What is the scale factor?", m
def g7_geo(r):
    k = r.randint(0, 3); rad = r.randint(2, 10)
    if k == 0: return f"Circumference of a circle with radius {rad} cm (use π ≈ 3.14) =", f"{2 * 314 * rad / 100:.2f} cm"
    if k == 1: return f"Area of a circle with radius {rad} cm (use π ≈ 3.14) =", f"{314 * rad * rad / 100:.2f} square cm"
    a = r.randint(15, 75)
    if k == 2: return f"Two angles are complementary. One is {a}°. What is the other?", f"{90 - a}°"
    return f"Two angles are supplementary. One is {a + 60}°. What is the other?", f"{180 - a - 60}°"

# ---------------------------------------------------------------- Pre-Algebra
def pa_gcf(r):
    a, b = r.randint(2, 9) * r.randint(2, 6), r.randint(2, 9) * r.randint(2, 6)
    from math import gcd
    if r.random() < .5: return f"GCF of {a} and {b} =", gcd(a, b)
    return f"LCM of {a} and {b} =", a * b // gcd(a, b)
def pa_primefac(r):
    n = r.choice([12, 18, 20, 24, 28, 30, 36, 40, 45, 48, 50, 54, 60, 72, 84, 90, 96, 100])
    f, m, p = {}, n, 2
    while m > 1:
        while m % p == 0: f[p] = f.get(p, 0) + 1; m //= p
        p += 1
    return f"Write the prime factorization of {n} (use exponents).", " × ".join(pw(k, v) if v > 1 else str(k) for k, v in sorted(f.items()))
def pa_seq(r):
    if r.random() < .5:
        a, d, n = r.randint(1, 15), r.randint(2, 9), r.randint(10, 30)
        return f"Arithmetic sequence: {a}, {a + d}, {a + 2 * d}, …  What is term #{n}?", a + (n - 1) * d
    a, q = r.randint(1, 5), r.choice([2, 3]); seq = [a * q ** i for i in range(5)]
    return f"Geometric sequence: {', '.join(map(str, seq[:4]))}, ___", seq[4]
def pa_pctconv(r):
    p = r.choice([5, 10, 12.5, 20, 25, 40, 50, 60, 75, 80]); k = r.randint(0, 1)
    fr = Fr(Decimal(str(p)) / 100)
    if k == 0: return f"Write {dec(p)}% as a decimal and as a fraction in simplest form.", f"{dec(Decimal(str(p)) / 100)} and {fs(fr)}"
    return f"Write {fs(fr)} as a percent.", f"{dec(p)}%"
def pa_twovarsol(r):
    m, b, x = r.randint(-4, 5), r.randint(-6, 6), r.randint(-3, 5)
    y = m * x + b + r.choice([0, 0, 1])
    return f"Is ({neg(x)}, {neg(y)}) a solution of y = {cx(m) if m else '0x'} {'+' if b >= 0 else '−'} {abs(b)}? (yes or no)", "yes" if y == m * x + b else "no"
def pa_slope(r):
    x1, y1, dx = r.randint(-4, 4), r.randint(-5, 5), r.randint(1, 5); m = r.choice([-3, -2, -1, 1, 2, 3, 4])
    return f"Slope of the line through ({neg(x1)}, {neg(y1)}) and ({neg(x1 + dx)}, {neg(y1 + m * dx)}) =", neg(m)
def pa_func(r):
    m, b, x = r.choice([-4, -3, -2, 2, 3, 4, 5]), r.randint(-8, 8), r.randint(-4, 6); k = r.randint(0, 1)
    if k == 0: return f"f(x) = {cx(m)} {'+' if b >= 0 else '−'} {abs(b)}. Find f({neg(x)}).", neg(m * x + b)
    return f"What are the slope and y-intercept of y = {cx(m)} {'+' if b >= 0 else '−'} {abs(b)}?", f"slope {neg(m)}, y-intercept {neg(b)}"
def pa_rate_table(r):
    m, b = r.choice([2, 3, 4, 5, -2, -3]), r.randint(-5, 10); xs = [0, 1, 2, 3]
    return f"x: {', '.join(map(str, xs))}  →  y: {', '.join(neg(m * x + b) for x in xs)}. What is the rate of change?", neg(m)
def pa_sqrt(r):
    k = r.randint(0, 2)
    if k == 0: n = r.randint(2, 15); return f"√{n * n} =", n
    if k == 1: n = r.randint(2, 6); return f"∛{n ** 3} =", n
    n = r.randint(2, 15); return f"√{n * n + r.randint(1, 2 * n)} is between which two whole numbers?", f"{n} and {n + 1}"
def pa_expo(r):
    b, m, n = r.randint(2, 5), r.randint(2, 6), r.randint(2, 4); k = r.randint(0, 2)
    if k == 0: return f"Simplify: {pw(b, m)} × {pw(b, n)}", pw(b, m + n)
    if k == 1: return f"Simplify: {pw(b, m + n)} ÷ {pw(b, n)}", pw(b, m)
    return f"Simplify: ({pw(b, m)}){str(n).translate(SUP)}", pw(b, m * n)
def pa_sci(r):
    m = Decimal(r.randint(11, 99)) / 10; e = r.randint(3, 8)
    if r.random() < .5: return f"Write {num(int(m * 10 ** e))} in scientific notation.", f"{dec(m)} × {pw(10, e)}"
    e2 = r.randint(2, 5); v = m / Decimal(10) ** e2
    return f"Write {dec(m)} × 10⁻{str(e2).translate(SUP)} as a decimal.", format(v, "f")
def pa_multistep(r):
    x = r.randint(-6, 9); a, c = r.randint(3, 9), r.randint(1, 2); b = r.randint(1, 12); d = (a - c) * x + b
    if r.random() < .5: return f"Solve: {a}x + {b} = {cx(c)} {'+' if d >= 0 else '−'} {abs(d)}", f"x = {neg(x)}"
    p, q = r.randint(2, 5), r.randint(1, 6); return f"Solve: {p}(x + {q}) = {neg(p * (x + q))}", f"x = {neg(x)}"
def pa_ineq(r):
    a, x, b = r.randint(2, 6), r.randint(-5, 9), r.randint(1, 12)
    if r.random() < .5: return f"Solve: {a}x + {b} ≥ {neg(a * x + b)}", f"x ≥ {neg(x)}"
    return f"Solve: −{a}x > {neg(-a * x)}   (remember to flip the sign!)", f"x < {neg(x)}"
def pa_system(r):
    x, y = r.randint(-5, 9), r.randint(-5, 9)
    if r.random() < .5: return f"Solve the system:  x + y = {neg(x + y)},  x − y = {neg(x - y)}", f"x = {neg(x)}, y = {neg(y)}"
    k = r.randint(2, 4); x = r.randint(1, 8); return f"Solve the system:  y = {k}x,  x + y = {x + k * x}", f"x = {x}, y = {k * x}"
def pa_isprop(r):
    k = r.randint(2, 6); b = r.choice([0, 0, r.randint(1, 4)]); xs = [1, 2, 3, 4]
    return f"x: 1, 2, 3, 4  →  y: {', '.join(str(k * x + b) for x in xs)}. Is y proportional to x? (yes or no)", "yes" if b == 0 else "no"
def pa_pctword(r):
    k = r.randint(0, 1); price = r.choice([24, 36, 48, 60, 80, 120, 150])
    if k == 0: t = r.choice([5, 8, 10]); return f"A ${price} game has {t}% sales tax. What is the total cost?", money(price * (100 + t))
    n, part = r.choice([(20, 15), (40, 30), (25, 20), (50, 35), (80, 60)]); return f"{part} out of {n} students passed. What percent passed?", f"{part * 100 // n}%"

# ---------------------------------------------------------------- Competition Math (Apex curriculum)
def c_x11(r):
    a = r.randint(12, 99); return f"Mental math: {a} × 11 =", a * 11
def c_square(r):
    a = r.choice([r.randint(11, 25), r.choice([45, 55, 65, 75, 85, 95])]); return f"Mental math: {a}² =", a * a
def c_swap(r):
    a, b = r.choice([(18, 50), (24, 25), (36, 50), (8, 75), (12, 25), (44, 25)]); return f"Mental math: {a}% of {b} = ?  (Hint: {a}% of {b} = {b}% of {a})", dec(Decimal(a * b) / 100)
def c_gauss(r):
    n = r.choice([10, 20, 30, 40, 50, 100]); return f"1 + 2 + 3 + … + {n} =", n * (n + 1) // 2
def c_diffsq(r):
    a = r.randint(30, 99); b = r.randint(1, a - 10); return f"Mental math: {a}² − {b}² =  (Hint: (a + b)(a − b))", a * a - b * b
def c_divis(r):
    n = r.randint(100, 9999); d = r.choice([3, 9, 4, 6]); return f"Is {num(n)} divisible by {d}? (yes or no)", "yes" if n % d == 0 else "no"
def c_remainder(r):
    n, d = r.randint(50, 999), r.randint(3, 12); return f"What is the remainder when {n} is divided by {d}?", n % d
def c_numfactors(r):
    n = r.choice([12, 18, 24, 30, 36, 48, 60, 72, 100]); return f"How many positive factors does {n} have?", sum(1 for k in range(1, n + 1) if n % k == 0)
def c_lcmword(r):
    a, b = r.choice([(4, 6), (6, 8), (6, 10), (8, 12), (9, 12), (10, 15)])
    from math import gcd
    return f"One bus comes every {a} minutes and another every {b} minutes. They both just came. In how many minutes will they next come together?", a * b // gcd(a, b)
def c_perm(r):
    n = r.randint(3, 6); f = 1
    for k in range(2, n + 1): f *= k
    return f"How many ways can {n} friends stand in a line?", f
def c_handshake(r):
    n = r.randint(4, 12); return f"{n} people each shake hands with every other person once. How many handshakes?", n * (n - 1) // 2
def c_outfits(r):
    s, p, h = r.randint(2, 6), r.randint(2, 5), r.randint(2, 4); return f"You have {s} shirts, {p} pants, and {h} hats. How many different outfits?", s * p * h
def c_digitsum(r):
    k = r.randint(3, 15); return f"How many two-digit numbers have digits that add up to {k}?", sum(1 for n in range(10, 100) if n // 10 + n % 10 == k)
def c_grid(r):
    a, b = r.randint(2, 4), r.randint(2, 4)
    from math import comb
    return f"On a grid, how many shortest paths go from (0, 0) to ({a}, {b}) moving only right or up?", comb(a + b, a)
def c_dice(r):
    k = r.randint(2, 12); ways = sum(1 for a in range(1, 7) for b in range(1, 7) if a + b == k)
    return f"Two dice are rolled. What is the probability the sum is {k}?", fs(Fr(ways, 36))
def c_coins(r):
    n = r.randint(2, 4); return f"{n} coins are flipped. What is the probability that all of them land heads?", f"1/{2 ** n}"
def c_marbles(r):
    rd, bl = r.randint(2, 6), r.randint(2, 6); t = rd + bl
    return f"A bag has {rd} red and {bl} blue marbles. Two are drawn without replacement. P(both red) = ?", fs(Fr(rd * (rd - 1), t * (t - 1)))
def c_sumdiff(r):
    a, b = r.randint(10, 60), r.randint(1, 30); return f"Two numbers add to {a + b} and their difference is {a - b if a > b else b - a}. What is the larger number?", max(a, b)
def c_consec(r):
    n, k = r.randint(5, 40), r.choice([3, 5]); return f"The sum of {k} consecutive whole numbers is {sum(range(n, n + k))}. What is the smallest one?", n
def c_age(r):
    kid, gap, yrs = r.randint(5, 12), r.randint(20, 32), r.randint(2, 10)
    return f"A mom is {gap} years older than her son. In {yrs} years, their ages will add to {2 * (kid + yrs) + gap}. How old is the son now?", kid
def c_backwards(r):
    x, a, b = r.randint(3, 20), r.randint(2, 5), r.randint(3, 15)
    return f"I think of a number, multiply by {a}, then subtract {b}. I get {a * x - b}. What was my number?", x
def c_polyangles(r):
    n = r.choice([5, 6, 8, 9, 10, 12])
    if r.random() < .5: return f"What is the sum of the interior angles of a {n}-sided polygon?", f"{(n - 2) * 180}°"
    return f"Each interior angle of a regular {n}-sided polygon measures how many degrees?", f"{(n - 2) * 180 // n}°"
def c_diagonals(r):
    n = r.randint(5, 12); return f"How many diagonals does a polygon with {n} sides have?", n * (n - 3) // 2
def c_pyth(r):
    a, b, c = r.choice([(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25)]); m = r.randint(1, 4)
    return f"A right triangle has legs {a * m} and {b * m}. How long is the hypotenuse?", c * m
def c_squarearea(r):
    s = r.randint(3, 15); return f"A square has an area of {s * s} square cm. What is its perimeter?", f"{4 * s} cm"
def c_series(r):
    a, d, n = r.randint(1, 10), r.randint(1, 6), r.randint(5, 20); last = a + (n - 1) * d
    return f"Find the sum: {a} + {a + d} + {a + 2 * d} + … + {last}", n * (a + last) // 2
def c_unitsdigit(r):
    b, e = r.choice([2, 3, 7, 8]), r.randint(10, 60); return f"What is the ones digit of {pw(b, e)}?", pow(b, e, 10)
def c_triangular(r):
    n = r.randint(6, 15); return f"Triangular numbers: 1, 3, 6, 10, 15, … What is the {n}th triangular number?", n * (n + 1) // 2
def c_clock(r):
    h = r.randint(1, 11); a = abs(30 * h) % 360; a = min(a, 360 - a); return f"At {h}:00, what is the smaller angle between the clock hands?", f"{a}°"
def c_digitcount(r):
    n = r.choice([50, 100, 120, 200]); d = r.choice([1, 2, 7]); return f"How many times is the digit {d} written when you write the numbers from 1 to {n}?", sum(str(k).count(str(d)) for k in range(1, n + 1))
def c_socks(r):
    return pick(r, [("A drawer has 10 red and 10 blue socks. How many must you take (without looking) to be sure of a matching pair?", 3),
                    ("A drawer has 6 red and 6 blue socks. How many must you take to be sure of getting 2 red socks?", 8),
                    ("A bag has 5 red, 5 blue, and 5 green marbles. How many must you take to be sure of 2 of the same color?", 4),
                    ("How many people must be in a room to be sure two share a birth month?", 13)])
def c_digitpuzzle(r):
    while True:
        s, k = r.randint(5, 15), r.randint(1, 5); sols = [n for n in range(10, 100) if n // 10 + n % 10 == s and n // 10 - n % 10 == k]
        if len(sols) == 1: return f"I am a two-digit number. My digits add to {s}, and my tens digit is {k} more than my ones digit. What number am I?", sols[0]

# ---------------------------------------------------------------- Courses & units
def U(ka, title, *sections): return {"ka": ka, "title": title, "sections": list(sections)}
S = lambda name, n, fn: (name, n, fn)

COURSES = [
  {"id": "g1", "name": "Grade 1", "course": "Elementary School Math", "ka": KA + "cc-1st-grade-math", "units": [
    U("cc-1st-place-value", "Place value", S("Tens and ones", 5, g1_tens), S("10 more, 10 less", 5, g1_tenmore), S("Compare numbers", 4, g1_compare)),
    U("cc-1st-add-subtract", "Addition and subtraction", S("Add within 20", 5, g1_add), S("Subtract within 20", 5, g1_sub), S("Missing numbers", 3, g1_missing), S("Word problems", 3, g1_word)),
    U("cc-1st-measurement-geometry", "Measurement, data, and geometry", S("Compare lengths", 3, g1_length), S("Tell time", 4, g1_time), S("Shapes", 4, g1_shape), S("Data", 3, g1_data))]},
  {"id": "g2", "name": "Grade 2", "course": "Elementary School Math", "ka": KA + "cc-2nd-grade-math", "units": [
    U("x3184e0ec:add-and-subtract-within-20", "Add and subtract within 20", S("Add within 20", 7, g1_add), S("Subtract within 20", 7, g1_sub), S("Missing numbers", 3, g1_missing)),
    U("cc-2nd-place-value", "Place value", S("Expanded form", 4, g2_expanded), S("Value of a digit", 4, g2_digit), S("Skip counting", 3, g2_skip), S("Compare numbers", 4, g2_compare3)),
    U("cc-2nd-add-subtract-100", "Add and subtract within 100", S("Add", 7, g2_add100), S("Subtract", 7, g2_sub100), S("Word problems", 2, g1_word)),
    U("cc-2nd-add-subtract-1000", "Add and subtract within 1,000", S("Add", 7, g2_add1000), S("Subtract", 7, g2_sub1000)),
    U("x3184e0ec:money-and-time", "Money and time", S("Count coins", 4, g2_coins), S("Make change", 3, g2_change), S("Tell time to 5 minutes", 4, g2_clock), S("AM or PM", 3, g2_ampm)),
    U("cc-2nd-measurement-data", "Measurement", S("Length differences", 6, g2_lengthdiff), S("Estimate length", 5, g2_estimate)),
    U("x3184e0ec:data", "Data", S("Read data", 8, g2_bar)),
    U("x3184e0ec:geometry", "Geometry", S("Shapes", 6, g2_shapes), S("Equal shares", 3, g2_shares))]},
  {"id": "g3", "name": "Grade 3", "course": "Elementary School Math", "ka": KA + "cc-third-grade-math", "units": [
    U("intro-to-multiplication", "Intro to multiplication", S("Equal groups", 8, g3_groups), S("Multiply by 0 or 1", 4, g3_mult01)),
    U("3rd-basic-multiplication", "1-digit multiplication", S("Multiplication facts", 14, g3_mult)),
    U("imp-addition-and-subtraction", "Addition, subtraction, and estimation", S("Add and subtract 3-digit numbers", 6, g3_add3), S("Rounding", 4, g3_round), S("Estimate", 3, g3_estimate)),
    U("intro-to-division", "Intro to division", S("Equal sharing", 5, g3_share), S("Division facts", 8, g3_divfact)),
    U("imp-fractions", "Understand fractions", S("Fractions of shapes", 6, g3_fracshade), S("Fractions on a number line", 6, g3_fracline)),
    U("equivalent-fractions-and-comparing-fractions", "Equivalent fractions and comparing fractions", S("Equivalent fractions", 6, g3_fraceq), S("Compare fractions", 7, g3_fraccmp)),
    U("imp-multiplication-and-division", "More with multiplication and division", S("Missing factors", 6, g3_missfactor), S("Multiply by tens", 5, g3_tens), S("Division facts", 3, g3_divfact)),
    U("arithmetic-patterns-and-problem-solving", "Arithmetic patterns and problem solving", S("Two-step word problems", 5, g3_twostep), S("Odd or even", 4, g3_oddeven), S("Patterns", 4, g3_rule)),
    U("quadrilaterals-3rd", "Quadrilaterals", S("Quadrilaterals", 7, g3_quad)),
    U("imp-geometry", "Area", S("Area", 10, g3_area)),
    U("3rd-perimeter", "Perimeter", S("Perimeter", 10, g3_perim)),
    U("time", "Time", S("Elapsed time", 10, g3_elapsed)),
    U("imp-measurement-and-data", "Measurement", S("Mass and liquid volume", 8, g3_mass)),
    U("represent-and-interpret-data", "Represent and interpret data", S("Picture graphs", 8, g3_picture))]},
  {"id": "g4", "name": "Grade 4", "course": "Elementary School Math", "ka": KA + "cc-fourth-grade-math", "units": [
    U("imp-place-value-and-rounding-2", "Place value", S("Value of a digit", 6, g4_digitval), S("Rounding", 6, g4_round)),
    U("imp-addition-and-subtraction-2", "Addition, subtraction, and estimation", S("Multi-digit addition and subtraction", 10, g4_addsub)),
    U("imp-multiplication-and-division-2", "Multiply by 1-digit numbers", S("Multiply by 1-digit numbers", 12, g4_m1)),
    U("multiplying-by-2-digit-numbers", "Multiply by 2-digit numbers", S("Multiply 2-digit by 2-digit", 12, g4_m2)),
    U("division", "Division", S("Divide (with remainders)", 12, g4_div)),
    U("imp-factors-multiples-and-patterns", "Factors, multiples and patterns", S("Factor pairs", 3, g4_factors), S("Prime or composite", 5, g4_prime), S("Factors", 4, g4_isfactor)),
    U("comparing-fractions-and-equivalent-fractions", "Equivalent fractions and comparing fractions", S("Equivalent fractions", 6, g4_eqfrac), S("Compare fractions", 7, g4_cmpfrac)),
    U("imp-fractions-2", "Add and subtract fractions", S("Add and subtract fractions", 12, g4_addfrac)),
    U("4th-multiply-fractions", "Multiply fractions", S("Multiply a fraction by a whole number", 12, g4_mulfrac)),
    U("imp-decimals", "Understand decimals", S("Decimals", 12, g4_dec)),
    U("plane-figures", "Plane figures", S("Types of angles", 6, g4_angletype), S("Lines and symmetry", 5, g4_symmetry)),
    U("imp-geometry-2", "Measuring angles", S("Angle measures", 10, g4_angles)),
    U("area-perimeter", "Area and perimeter", S("Area and perimeter", 10, g4_ap)),
    U("imp-measurement-and-data-2", "Units of measurement", S("Convert units", 12, g4_units))]},
  {"id": "g5", "name": "Grade 5", "course": "Elementary School Math", "ka": KA + "cc-fifth-grade-math", "units": [
    U("imp-place-value-and-decimals", "Decimal place value", S("Value of a digit", 4, g5_decval), S("Round decimals", 4, g5_decround), S("Compare decimals", 4, g5_deccmp)),
    U("imp-addition-and-subtraction-3", "Add decimals", S("Add decimals", 12, g5_adddec)),
    U("subtract-decimals", "Subtract decimals", S("Subtract decimals", 12, g5_subdec)),
    U("imp-fractions-3", "Add and subtract fractions", S("Unlike denominators", 12, g5_addfrac)),
    U("multi-digit-multiplication-and-division", "Multi-digit multiplication and division", S("Multiply", 6, g5_mult), S("Divide", 6, g5_div)),
    U("5th-multiply-fractions", "Multiply fractions", S("Multiply fractions", 12, g5_mulfrac)),
    U("divide-fractions", "Divide fractions", S("Divide with unit fractions", 12, g5_divfrac)),
    U("imp-multiplication-and-division-3", "Multiply decimals", S("Multiply decimals", 12, g5_muldec)),
    U("divide-decimals", "Divide decimals", S("Divide decimals", 12, g5_divdec)),
    U("powers-of-ten", "Powers of ten", S("Multiply and divide by powers of 10", 12, g5_pow10)),
    U("5th-volume", "Volume", S("Volume", 10, g5_volume)),
    U("imp-geometry-3", "Coordinate plane", S("Coordinate plane", 10, g5_coord)),
    U("imp-algebraic-thinking", "Algebraic thinking", S("Order of operations & expressions", 10, g5_orderops)),
    U("imp-measurement-and-data-3", "Converting units of measure", S("Convert units", 12, g5_conv)),
    U("line-plots", "Line plots", S("Line plot data", 8, g5_lineplot)),
    U("properties-of-shapes", "Properties of shapes", S("Classify triangles", 6, g5_triangles), S("Quadrilateral families", 4, g5_quadsyes))]},
  {"id": "g6", "name": "Grade 6", "course": "Middle School Math", "ka": KA + "cc-sixth-grade-math", "units": [
    U("cc-6th-ratios-prop-topic", "Ratios", S("Ratios", 10, g6_ratio)),
    U("cc-6th-arithmetic-operations", "Arithmetic with rational numbers", S("Divide fractions", 6, g6_fracdiv), S("Decimal operations", 6, g6_decops)),
    U("x0267d782:cc-6th-rates-and-percentages", "Rates and percentages", S("Unit rates", 5, g6_unitrate), S("Percentages", 7, g6_pct)),
    U("x0267d782:cc-6th-exponents-and-order-of-operations", "Exponents and order of operations", S("Exponents & order of operations", 12, g6_exp)),
    U("cc-6th-negative-number-topic", "Negative numbers", S("Negative numbers", 12, g6_neg)),
    U("cc-6th-expressions-and-variables", "Variables & expressions", S("Expressions", 12, g6_varexp)),
    U("cc-6th-equations-and-inequalities", "Equations & inequalities", S("One-step equations & inequalities", 12, g6_eq)),
    U("x0267d782:cc-6th-plane-figures", "Plane figures", S("Area of triangles, parallelograms, trapezoids", 10, g6_area)),
    U("x0267d782:coordinate-plane", "Coordinate plane", S("Coordinate plane", 10, g6_coord)),
    U("cc-6th-geometry-topic", "3D figures", S("Surface area & volume", 8, g6_3d)),
    U("cc-6th-data-statistics", "Data and statistics", S("Mean, median & range", 9, g6_stats))]},
  {"id": "g7", "name": "Grade 7", "course": "Middle School Math", "ka": KA + "cc-seventh-grade-math", "units": [
    U("cc-7th-ratio-proportion", "Proportional relationships", S("Proportional relationships", 10, g7_prop)),
    U("cc-7th-fractions-decimals", "Rates and percentages", S("Percent problems", 10, g7_pct)),
    U("cc-7th-negative-numbers-add-and-subtract", "Integers: addition and subtraction", S("Add & subtract integers", 14, g7_intaddsub)),
    U("x6b17ba59:rational-numbers-addition-and-subtraction", "Rational numbers: addition and subtraction", S("Add rational numbers", 12, g7_ratas)),
    U("cc-7th-negative-numbers-multiply-and-divide", "Negative numbers: multiplication and division", S("Multiply & divide", 14, g7_negmd)),
    U("cc-7th-variables-expressions", "Expressions, equations, & inequalities", S("Equations, expressions & inequalities", 12, g7_eq)),
    U("cc-7th-probability-statistics", "Statistics and probability", S("Probability", 10, g7_prob)),
    U("x6b17ba59:scale-drawings", "Scale copies", S("Scale drawings", 10, g7_scale)),
    U("cc-7th-geometry", "Geometry", S("Circles & angles", 10, g7_geo))]},
  {"id": "pa", "name": "Pre-Algebra", "course": "Middle School Math", "ka": KA + "pre-algebra", "units": [
    U("pre-algebra-factors-multiples", "Factors and multiples", S("GCF and LCM", 6, pa_gcf), S("Prime factorization", 5, pa_primefac)),
    U("xb4832e56:patterns", "Patterns", S("Sequences", 10, pa_seq)),
    U("pre-algebra-ratios-rates", "Ratios and rates", S("Ratios", 6, g6_ratio), S("Unit rates", 5, g6_unitrate)),
    U("xb4832e56:percentages", "Percentages", S("Convert percents", 5, pa_pctconv), S("Percent of a number", 6, g6_pct)),
    U("xb4832e56:exponents-intro-and-order-of-operations", "Exponents intro and order of operations", S("Exponents & order of operations", 12, g6_exp)),
    U("xb4832e56:variables-expressions", "Variables & expressions", S("Expressions", 12, g6_varexp)),
    U("pre-algebra-equations-expressions", "Equations & inequalities introduction", S("One-step equations & inequalities", 12, g6_eq)),
    U("xb4832e56:percent-rational-number-word-problems", "Percent & rational number word problems", S("Percent word problems", 6, pa_pctword), S("Discounts & tips", 5, g7_pct)),
    U("xb4832e56:proportional-relationships", "Proportional relationships", S("Is it proportional?", 5, pa_isprop), S("Proportions", 6, g7_prop)),
    U("xb4832e56:one-step-and-two-step-equations-inequalities", "One-step and two-step equations & inequalities", S("Two-step equations", 6, g7_eq), S("Inequalities", 6, pa_ineq)),
    U("pre-algebra-exponents-radicals", "Roots, exponents, & scientific notation", S("Roots", 4, pa_sqrt), S("Exponent rules", 4, pa_expo), S("Scientific notation", 4, pa_sci)),
    U("xb4832e56:multi-step-equations", "Multi-step equations", S("Multi-step equations", 12, pa_multistep)),
    U("xb4832e56:two-variable-equations", "Two-variable equations", S("Solutions of equations", 6, pa_twovarsol), S("Slope", 6, pa_slope)),
    U("xb4832e56:functions-and-linear-models", "Functions and linear models", S("Functions", 6, pa_func), S("Rate of change", 5, pa_rate_table)),
    U("xb4832e56:systems-of-equations", "Systems of equations", S("Solve systems", 10, pa_system))]},
  {"id": "comp", "name": "Competition Math", "course": "Test Prep", "ka": "https://artofproblemsolving.com/alcumus", "kaLabel": "AoPS Alcumus (free practice)", "units": [
    U(None, "Mental math & number sense", S("Mental math tricks", 6, c_x11), S("Squares & shortcuts", 4, c_square), S("Percent swap", 2, c_swap), S("Difference of squares", 2, c_diffsq)),
    U(None, "Number theory", S("Divisibility", 4, c_divis), S("Remainders", 3, c_remainder), S("Counting factors", 3, c_numfactors), S("LCM word problems", 2, c_lcmword)),
    U(None, "Counting", S("Arrangements", 3, c_perm), S("Handshakes", 2, c_handshake), S("Outfits", 2, c_outfits), S("Digit counting", 2, c_digitsum), S("Grid paths", 2, c_grid)),
    U(None, "Probability", S("Dice", 5, c_dice), S("Coins", 3, c_coins), S("Marbles", 4, c_marbles)),
    U(None, "Algebra & word problems", S("Sum & difference", 3, c_sumdiff), S("Consecutive numbers", 3, c_consec), S("Ages", 3, c_age), S("Work backwards", 3, c_backwards)),
    U(None, "Geometry", S("Polygon angles", 4, c_polyangles), S("Diagonals", 3, c_diagonals), S("Pythagorean triples", 3, c_pyth), S("Area & perimeter", 2, c_squarearea)),
    U(None, "Patterns & sequences", S("Series sums", 4, c_series), S("Ones digits of powers", 4, c_unitsdigit), S("Triangular numbers", 3, c_triangular)),
    U(None, "Logic & problem solving", S("Digit puzzles", 4, c_digitpuzzle), S("Clock angles", 3, c_clock), S("Counting digits", 2, c_digitcount), S("Pigeonhole", 3, c_socks)),
    U(None, "Contest practice (mixed)", S("Round 1", 5, lambda r: r.choice([c_x11, c_gauss, c_remainder, c_handshake, c_dice, c_backwards, c_polyangles, c_unitsdigit])(r)),
      S("Round 2", 5, lambda r: r.choice([c_diffsq, c_numfactors, c_grid, c_marbles, c_consec, c_pyth, c_series, c_digitpuzzle])(r)))]},
]

# ---------------------------------------------------------------- worksheet pages
CSS = """
@page{size:letter;margin:.55in}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;color:#1d2a3b;background:#eef3f8}
.sheet{background:white;width:8.5in;min-height:11in;margin:20px auto;padding:.55in;box-shadow:0 8px 30px rgba(20,36,58,.12)}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #14243a;padding-bottom:10px;margin-bottom:12px;gap:16px}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.06em;color:#14243a;white-space:nowrap}.brand img{width:38px;height:38px}
.title{text-align:right}.title b{display:block;font-size:18px;color:#14243a}.title span{font-size:12px;color:#5b6b80}
.meta{display:flex;gap:28px;font-size:13px;margin:8px 0 14px}.meta span{flex:1;border-bottom:1px solid #9aa8b8;padding-bottom:2px}
h2{font-size:14px;color:#315f91;text-transform:uppercase;letter-spacing:.08em;margin:12px 0 6px;border-left:4px solid #f3c969;padding-left:8px}
ol{margin:0;padding-left:26px;display:grid;grid-template-columns:1fr 1fr;column-gap:28px;row-gap:6px;font-size:14px}
ol.wide{grid-template-columns:1fr}
li{padding-bottom:13px;border-bottom:1px dashed #d8e1ea}
.key ol li{padding-bottom:4px;border-bottom:0}.key li b{color:#2f7d66}
.foot{margin-top:18px;font-size:11px;color:#56657a;text-align:center}
.tip{background:#fff8e6;border-left:4px solid #f3c969;padding:8px 10px;font-size:12px;margin-top:8px}
.printbar{max-width:8.5in;margin:16px auto 0;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;font-family:inherit}
.printbar a,.printbar button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:10px 16px;background:#14243a;color:white;cursor:pointer;text-decoration:none}
.printbar a.light{background:white;color:#14243a;border:1px solid #d8e1ea}
@media print{body{background:white}.sheet{margin:0;box-shadow:none;width:auto;min-height:auto;padding:0;page-break-after:always}.sheet:last-child{page-break-after:auto}.printbar{display:none}}
"""

def sheet(course, unit_no, unit_title, version, sections, key=False):
    blocks, n = [], 1
    for name, items in sections:
        wide = any(len(q) > 44 for q, _ in items)
        lis = "".join(f'<li value="{n + i}">{html.escape(q)}' + (f' <b>{html.escape(str(a))}</b>' if key else "") + "</li>" for i, (q, a) in enumerate(items))
        blocks.append(f'<h2>{html.escape(name)}</h2><ol class="{"wide" if wide else ""}" start="{n}">{lis}</ol>')
        n += len(items)
    title = f"{course['name']} · Unit {unit_no}: {unit_title}"
    head = (f'<div class="head"><div class="brand"><img src="../logo.svg" alt="">APEX TUTORING</div>'
            f'<div class="title"><b>{html.escape(title)}</b><span>Practice {version}{" · Answer key" if key else ""}</span></div></div>')
    meta = "" if key else f'<div class="meta"><span>Name:</span><span>Date:</span><span>Score: ____ / {n - 1}</span></div>'
    tip = "" if key else '<div class="tip">Show your work! Stuck on one? Skip it and come back. That\'s a real test strategy.</div>'
    return f'<section class="sheet{" key" if key else ""}">{head}{meta}{tip}{"".join(blocks)}<div class="foot">© Apex Tutoring · apex-tutoring.github.io</div></section>'

def build():
    os.makedirs(OUT, exist_ok=True)
    catalog, written = [], 0
    for c in COURSES:
        cdata = {"id": c["id"], "name": c["name"], "course": c["course"], "ka": c["ka"], "kaLabel": c.get("kaLabel", "Khan Academy"), "units": []}
        for i, u in enumerate(c["units"], 1):
            slug = f"{c['id']}-u{i:02d}"
            sheets = []
            for version in ("A", "B"):
                r = random.Random(f"{slug}-{version}-2026")
                secs = []
                for name, count, fn in u["sections"]:
                    seen, items, tries = set(), [], 0
                    while len(items) < count and tries < 400:
                        q, a = fn(r); tries += 1
                        if q not in seen: seen.add(q); items.append((q, a))
                    secs.append((name, items))
                file = f"{slug}-{version.lower()}"
                back = "../portal.html"
                ka_link = (KA + c["ka"].split("/math/")[1] + "/" + u["ka"]) if u["ka"] else c["ka"]
                doc = (f'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
                       f'<title>{html.escape(c["name"])} Unit {i}: {html.escape(u["title"])} (Practice {version}) | Apex Tutoring</title><meta name="robots" content="noindex">'
                       f'<link rel="icon" href="../logo.svg"><style>{CSS}</style></head><body>'
                       f'<div class="printbar"><a class="light" href="{back}">← Portal</a><a class="light" href="{html.escape(ka_link)}" target="_blank" rel="noopener">Practice online ↗</a><button onclick="print()">Print / Save PDF</button></div>'
                       f'{sheet(c, i, u["title"], version, secs)}{sheet(c, i, u["title"], version, secs, key=True)}</body></html>')
                with open(os.path.join(OUT, file + ".html"), "w") as fh: fh.write(doc)
                written += 1
                sheets.append({"slug": file, "label": f"Practice {version}"})
            cdata["units"].append({"n": i, "title": u["title"], "skills": [s[0] for s in u["sections"]],
                                   "ka": (KA + c["ka"].split("/math/")[1] + "/" + u["ka"]) if u["ka"] else None, "sheets": sheets})
        catalog.append(cdata)
    review = {"grades-1-2": "Mixed review: Grades 1–2", "grade-3": "Mixed review: Grade 3", "grades-4-5": "Mixed review: Grades 4–5",
              "grades-6-7": "Mixed review: Grades 6–7", "pre-algebra": "Mixed review: Pre-Algebra", "competition": "Mixed review: Competition Math"}
    js = ("// Generated by tools/make_curriculum.py. Don't edit by hand; edit the script and re-run it.\n"
          "// Grades 1–7 and Pre-Algebra follow Khan Academy's course units; Competition Math is Apex's own curriculum.\n"
          f"export const CURRICULUM = {json.dumps(catalog, ensure_ascii=False, indent=1)};\n"
          f"export const REVIEW_PACKS = {json.dumps(review, ensure_ascii=False)};\n")
    with open(os.path.join(ROOT, "curriculum.js"), "w") as fh: fh.write(js)
    units = sum(len(c["units"]) for c in catalog)
    print(f"{len(catalog)} courses, {units} units, {written} worksheets written")

if __name__ == "__main__":
    build()
