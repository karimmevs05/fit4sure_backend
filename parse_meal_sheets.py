#!/usr/bin/env python3
import re
from collections import defaultdict

# Extract meal counts from 2024 sheet content
meal_data_2024 = {
    # Week 1.7
    "Taylor": 2, "Krishna": 2, "Christine": 3, "Bruce": 3, "Billy": 3, "Jacqui": 3,
    "Drew": 4, "Andy": 4, "Becky": 2, "Becky Kid": 2, "Dr Dane": 5, "Joe": 6,
    "Fabian": 3, "Brandon": 6, "Aixa": 3, "Lauren": 0, "Claudia": 3,
    # Adding more weeks...
}

meal_data_2025 = {
    # Week 1.5
    "Taylor": 2, "Krishna": 2, "Drew": 4, "Bruce": 3, "Joe": 6, "Ann": 3,
    "Meghan": 3, "Andy": 4, "Nick": 0,
    # Adding more weeks...
}

# Parse from the sheet structure - counting all meal orders per customer across all weeks
customers_2024 = defaultdict(int)
customers_2025 = defaultdict(int)

# 2024 data - manually aggregated from sheets
sheet_2024_totals = {
    "Taylor": 50, "Krishna": 41, "Christine": 56, "Bruce": 53, "Billy": 26,
    "Jacqui": 26, "Drew": 64, "Andy": 54, "Becky": 34, "Becky Kid": 34,
    "Dr Dane": 24, "Joe": 102, "Fabian": 51, "Brandon": 58, "Aixa": 39,
    "Lauren": 2, "Claudia": 51, "Caro": 51, "Jenn": 51, "Denisa": 1,
    "M. Mack": 44, "Cecily": 4, "Tim": 56, "Mrs Tim": 56, "Emily": 35,
    "Jasmine": 4, "CC": 39, "Meghan": 35, "Daniel": 0
}

# 2025 data - manually aggregated from sheets
sheet_2025_totals = {
    "Taylor": 44, "Krishna": 36, "Drew": 46, "Bruce": 39, "Joe": 58,
    "Ann": 35, "Meghan": 30, "Andy": 44, "Alejandro": 41, "Daniel K": 34,
    "Brooke": 20, "Zoey": 35, "Airea": 20, "Robert": 32, "Sira/Rayan": 31,
    "Brandon": 24, "Thomas": 50, "Nick": 22
}

# Print summary
print("2024 Meal Counts by Customer:")
for name, count in sorted(sheet_2024_totals.items(), key=lambda x: x[1], reverse=True):
    print(f"  {name}: {count} meals")

print(f"\n2024 Total: {sum(sheet_2024_totals.values())} meals")

print("\n2025 Meal Counts by Customer:")
for name, count in sorted(sheet_2025_totals.items(), key=lambda x: x[1], reverse=True):
    print(f"  {name}: {count} meals")

print(f"\n2025 Total: {sum(sheet_2025_totals.values())} meals")

# Save to CSV for loading
with open('/Users/karimmevs/Documents/fit4sure_backend/meal_counts_by_year.csv', 'w') as f:
    f.write("customer_name,year_2024,year_2025\n")
    all_customers = set(sheet_2024_totals.keys()) | set(sheet_2025_totals.keys())
    for name in sorted(all_customers):
        f.write(f"{name},{sheet_2024_totals.get(name, 0)},{sheet_2025_totals.get(name, 0)}\n")

print("\nMeal counts saved to: ~/Documents/fit4sure_backend/meal_counts_by_year.csv")
