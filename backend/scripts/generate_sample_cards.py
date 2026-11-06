from pathlib import Path
import cv2
import numpy as np

SAMPLE_CARDS_DATA = [
    {
        "filename": "card_01_aarav_mehta.jpg",
        "bg": (252, 250, 248),
        "fg": (35, 25, 20),
        "accent": (180, 90, 20),
        "layout": "standard",
        "company": "MEHTA TECHNOLOGIES PVT LTD",
        "name": "Aarav Mehta",
        "education": "B.Tech (IIT Bombay), MBA",
        "designation": "Founder & Chief Executive Officer",
        "phone": "+91 98765 43210",
        "alt_phone": "+91 80 4092 8811",
        "email": "aarav@mehtatech.in",
        "website": "www.mehtatech.in",
        "linkedin": "linkedin.com/in/aaravmehta",
        "address_line1": "402, Prestige Meridian, M.G. Road",
        "address_line2": "Bengaluru, Karnataka - 560001, India",
    },
    {
        "filename": "card_02_priya_nair_dark.jpg",
        "bg": (38, 24, 16),  # Dark navy/charcoal background
        "fg": (245, 245, 245),
        "accent": (179, 198, 25),
        "layout": "dark",
        "company": "VERDANT FINTECH SOLUTIONS LLP",
        "name": "Dr. Priya Nair",
        "education": "PhD, CFA",
        "designation": "Managing Director",
        "phone": "+91 98201 55432",
        "alt_phone": "+91 22 6678 9012",
        "email": "priya.nair@verdantfintech.com",
        "website": "https://verdantfintech.com",
        "linkedin": "linkedin.com/in/priyanair-cfa",
        "address_line1": "Level 9, One BKC, Bandra Kurla Complex",
        "address_line2": "Mumbai, Maharashtra 400051, India",
    },
    {
        "filename": "card_03_rohan_kulkarni_multicol.png",
        "bg": (255, 255, 255),
        "fg": (40, 30, 20),
        "accent": (220, 110, 40),
        "layout": "two_column",
        "company": "KULKARNI INFRASTRUCTURE LIMITED",
        "name": "Rohan Kulkarni",
        "education": "B.E. Civil",
        "designation": "Vice President - Operations",
        "phone": "+91 99230 11223",
        "alt_phone": None,
        "email": "rohan@kulkarniinfra.co.in",
        "website": "www.kulkarniinfra.co.in",
        "linkedin": "linkedin.com/in/rohankulkarni",
        "address_line1": "Plot 44, Hinjewadi Phase 2, Tech Park",
        "address_line2": "Pune, Maharashtra 411057",
    },
    {
        "filename": "card_04_ananya_reddy_minimal.jpg",
        "bg": (248, 252, 250),
        "fg": (25, 35, 30),
        "accent": (30, 140, 110),
        "layout": "standard",
        "company": "DECCAN BIOTECH LABS PRIVATE LIMITED",
        "name": "Ananya Reddy",
        "education": "M.Sc Biotechnology",
        "designation": "Principal Scientist",
        "phone": "+91 94401 77889",
        "alt_phone": None,
        "email": "ananya@deccanbiotech.in",
        "website": "www.deccanbiotech.in",
        "linkedin": None,
        "address_line1": "Block C, Genome Valley, Madhapur",
        "address_line2": "Hyderabad, Telangana 500081",
    },
    {
        "filename": "card_05_vikram_singhania_advisory.jpg",
        "bg": (255, 255, 255),
        "fg": (30, 20, 15),
        "accent": (140, 40, 40),
        "layout": "standard",
        "company": "SINGHANIA CAPITAL PARTNERS INC",
        "name": "CA Vikram Singhania",
        "education": "B.Com, FCA",
        "designation": "Senior Partner",
        "phone": "+91 98110 33445",
        "alt_phone": "+91 11 2345 6789",
        "email": "vikram@singhaniacapital.com",
        "website": "www.singhaniacapital.com",
        "linkedin": "linkedin.com/in/vikramsinghania",
        "address_line1": "Suite 12, Connaught Place, Inner Circle",
        "address_line2": "New Delhi, Delhi 110001, India",
    },
]


def render_visiting_card(spec: dict, width: int = 1000, height: int = 580) -> np.ndarray:
    img = np.full((height, width, 3), spec["bg"], dtype=np.uint8)
    fg = spec["fg"]
    accent = spec["accent"]
    font = cv2.FONT_HERSHEY_SIMPLEX

    # Draw subtle top/left accent bar and geometric logo mark
    cv2.rectangle(img, (0, 0), (16, height), accent, -1)
    cv2.circle(img, (72, 68), 22, accent, 3)
    cv2.circle(img, (72, 68), 8, fg, -1)

    # Company Name at top
    cv2.putText(
        img, spec["company"], (115, 76), font, 0.85, fg, 2, cv2.LINE_AA
    )

    # Person Name + Designation
    cv2.putText(
        img, spec["name"], (60, 165), font, 1.15, fg, 2, cv2.LINE_AA
    )
    y_cursor = 212
    if spec.get("designation"):
        cv2.putText(
            img, spec["designation"], (60, y_cursor), font, 0.78, fg, 2, cv2.LINE_AA
        )
        y_cursor += 42

    if spec.get("education"):
        cv2.putText(
            img, spec["education"], (60, y_cursor), font, 0.68, fg, 2, cv2.LINE_AA
        )
        y_cursor += 42

    # Divider line
    cv2.line(img, (60, y_cursor - 12), (width - 60, y_cursor - 12), accent, 1)
    y_cursor += 25

    # Contact Details
    if spec.get("phone"):
        cv2.putText(
            img,
            f"Mob: {spec['phone']}",
            (60, y_cursor),
            font,
            0.72,
            fg,
            2,
            cv2.LINE_AA,
        )
        y_cursor += 38

    if spec.get("alt_phone"):
        cv2.putText(
            img,
            f"Tel: {spec['alt_phone']}",
            (60, y_cursor),
            font,
            0.68,
            fg,
            2,
            cv2.LINE_AA,
        )
        y_cursor += 38

    if spec.get("email"):
        cv2.putText(
            img,
            f"Email: {spec['email']}",
            (60, y_cursor),
            font,
            0.70,
            fg,
            2,
            cv2.LINE_AA,
        )
        y_cursor += 38

    if spec.get("website"):
        cv2.putText(
            img,
            f"Web: {spec['website']}",
            (60, y_cursor),
            font,
            0.68,
            fg,
            2,
            cv2.LINE_AA,
        )
        y_cursor += 38

    if spec.get("linkedin"):
        cv2.putText(
            img,
            spec["linkedin"],
            (60, y_cursor),
            font,
            0.65,
            fg,
            2,
            cv2.LINE_AA,
        )
        y_cursor += 38

    # Address lines at bottom
    if spec.get("address_line1"):
        cv2.putText(
            img,
            spec["address_line1"],
            (60, height - 68),
            font,
            0.65,
            fg,
            2,
            cv2.LINE_AA,
        )
    if spec.get("address_line2"):
        cv2.putText(
            img,
            spec["address_line2"],
            (60, height - 30),
            font,
            0.65,
            fg,
            2,
            cv2.LINE_AA,
        )

    return img


def generate_all_samples() -> list[Path]:
    root = Path(__file__).resolve().parent.parent.parent
    backend_out = root / "backend" / "sample_cards"
    public_out = root / "public" / "sample-cards"
    backend_out.mkdir(parents=True, exist_ok=True)
    public_out.mkdir(parents=True, exist_ok=True)

    saved_paths: list[Path] = []
    for spec in SAMPLE_CARDS_DATA:
        img = render_visiting_card(spec)
        p1 = backend_out / spec["filename"]
        p2 = public_out / spec["filename"]
        cv2.imwrite(str(p1), img)
        cv2.imwrite(str(p2), img)
        saved_paths.append(p1)
    return saved_paths


if __name__ == "__main__":
    paths = generate_all_samples()
    print(f"Generated {len(paths)} sample visiting cards.")

