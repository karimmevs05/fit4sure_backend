#!/usr/bin/env python3
import pandas as pd
import subprocess

# Read the meal counts CSV
meal_counts = pd.read_csv('/Users/karimmevs/Documents/fit4sure_backend/meal_counts_by_year.csv')

# Read customer data from database
result = subprocess.run([
    'psql', 'fit4sure', '-c',
    """SELECT c.name,
       CASE WHEN c.active THEN 'Active' ELSE 'Inactive' END as status,
       c.dietary_restrictions,
       c.sales_pipeline_stage,
       c.engagement_score,
       c.notes
    FROM customers c
    ORDER BY c.name;"""
], capture_output=True, text=True)

# Parse psql output into DataFrame
lines = result.stdout.strip().split('\n')[2:]  # Skip header and separator
customers_data = []
for line in lines:
    if '|' in line:
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 6 and parts[0]:
            customers_data.append({
                'name': parts[0],
                'status': parts[1],
                'dietary_restrictions': parts[2],
                'pipeline_stage': parts[3],
                'engagement_score': parts[4],
                'notes': parts[5]
            })

customers_df = pd.DataFrame(customers_data)

# Merge datasets
merged = customers_df.merge(
    meal_counts,
    left_on='name',
    right_on='customer_name',
    how='left'
)

# Fill NaN with 0 for meal counts
merged['year_2024'] = merged['year_2024'].fillna(0).astype(int)
merged['year_2025'] = merged['year_2025'].fillna(0).astype(int)

# 2026 data (from financial_entries - weekly totals)
meals_2026_totals = {
    "Week 1.18": 45, "Week 1.25": 43, "Week 2.1": 46, "Week 2.8": 44,
    "Week 2.15": 52, "Week 2.22": 52, "Week 03.01": 63, "Week 03.08": 58,
    "Week 3.22": 53, "Week 3.29": 56, "Week 4.5": 55, "Week 4.12": 51,
    "Week 4.19": 43, "Week 4.26": 53, "Week 5.03": 57, "Week 5.10": 47,
    "Week 5.17": 50, "Week 5.24": 36, "Week 5.31": 58, "Week 6.7": 55,
    "Week 6.14": 48, "Week 6.21": 41, "Week 7.5": 50, "Week 7.12": 49
}

year_2026_total = sum(meals_2026_totals.values())

# Calculate totals and metrics
merged['total_meals_all_time'] = merged['year_2024'] + merged['year_2025']
merged['avg_meals_per_week_2024'] = (merged['year_2024'] / 52).round(1)
merged['avg_meals_per_week_2025'] = (merged['year_2025'] / 52).round(1)

# Sort by total meals
merged = merged.sort_values('total_meals_all_time', ascending=False)

# Select and rename columns
export_df = merged[[
    'name', 'status', 'pipeline_stage', 'engagement_score',
    'year_2024', 'year_2025', 'total_meals_all_time',
    'avg_meals_per_week_2024', 'avg_meals_per_week_2025',
    'dietary_restrictions', 'notes'
]].rename(columns={
    'name': 'Customer Name',
    'status': 'Status',
    'pipeline_stage': 'Pipeline Stage',
    'engagement_score': 'Engagement Score',
    'year_2024': '2024 Meals',
    'year_2025': '2025 Meals',
    'total_meals_all_time': 'All-Time Total',
    'avg_meals_per_week_2024': 'Avg/Week 2024',
    'avg_meals_per_week_2025': 'Avg/Week 2025',
    'dietary_restrictions': 'Dietary Restrictions',
    'notes': 'Notes'
})

# Save to Excel
excel_path = '/Users/karimmevs/Documents/fit4sure_backend/customer_meal_analysis_comprehensive.xlsx'
with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
    export_df.to_excel(writer, sheet_name='Customer Analysis', index=False)

    # Add summary sheet
    summary_data = {
        'Metric': [
            'Total Customers',
            'Active Customers',
            'Inactive Customers',
            '2024 Total Meals',
            '2025 Total Meals',
            '2026 Total Meals (24 weeks)',
            'All-Time Total Meals',
            'Avg Meals per Customer (All-Time)',
            'Avg Meals per Customer (2024)',
            'Avg Meals per Customer (2025)'
        ],
        'Value': [
            len(export_df),
            len(export_df[export_df['Status'] == 'Active']),
            len(export_df[export_df['Status'] == 'Inactive']),
            export_df['2024 Meals'].sum(),
            export_df['2025 Meals'].sum(),
            year_2026_total,
            export_df['All-Time Total'].sum(),
            round(export_df['All-Time Total'].sum() / len(export_df), 1),
            round(export_df['2024 Meals'].sum() / len(export_df), 1),
            round(export_df['2025 Meals'].sum() / len(export_df), 1)
        ]
    }
    summary_df = pd.DataFrame(summary_data)
    summary_df.to_excel(writer, sheet_name='Summary', index=False)

print(f"✅ Comprehensive export created: {excel_path}")
print(f"\nSummary:")
print(f"  Total Customers: {len(export_df)}")
print(f"  Active: {len(export_df[export_df['Status'] == 'Active'])}")
print(f"  Inactive: {len(export_df[export_df['Status'] == 'Inactive'])}")
print(f"  2024 Total Meals: {export_df['2024 Meals'].sum()}")
print(f"  2025 Total Meals: {export_df['2025 Meals'].sum()}")
print(f"  2026 Total Meals (24 weeks): {year_2026_total}")
print(f"  All-Time Total: {export_df['All-Time Total'].sum()}")
