import pandas as pd

# =================== CONFIGURABLE VARIABLES =================== #

file_path = 'LeadsApart.csv'  # Input file path
output_file = './Files/default29.xlsx'  # Output file name


US_Filter = ["United States"]

# Business type filters with required subcategories
business_filters = {
    "rv park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "mobile home park":['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "trailer park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "rv parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "mobile home parks":['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "trailer parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "nursing homes": ['senior citizen center','assisted living facility', 'retirement community', 'retirement home', 'rehabilitation center', 'nursing home', 'no category'],
    "nursing home": ['senior citizen center','assisted living facility', 'retirement community', 'retirement home', 'rehabilitation center', 'nursing home', 'no category'],
    "apartment buildings": ['housing complex','apartment building', 'apartment complex', 'condominium complex', 'townhome complex', 'apartment rental agency', 'apartments', 'townhouse complex', 'condominium rental agency', 'no category'],
    "apartment building": ['housing complex','apartment building', 'apartment complex', 'condominium complex', 'townhome complex', 'apartment rental agency', 'apartments', 'townhouse complex', 'condominium rental agency', 'no category'],
    "high school": ['middle school', 'high school', 'charter school', 'senior high school'],
    "high schools": ['middle school', 'high school', 'charter school', 'senior high school'],
    "middle school": ['middle school', 'high school', 'charter school', 'senior high school'],
    "middle schools": ['middle school', 'high school', 'charter school', 'senior high school'],
    "laundromat": ['no category', 'laundry', 'laundromat', 'laundry service'],
    "laundromats": ['no category', 'laundry', 'laundromat', 'laundry service'],
    "auto repair shop": ['car service station', 'car repair and maintenance service', 'auto body shop', 'auto bodywork mechanic', 'auto dent removal service station', 'auto painting', 'car service station', 'auto restoration service', 'oil change service', 'auto air conditioning service', 'car inspection station', 'car repair and maintenance service', 'smog inspection station', 'vehicle inspection service', 'no category', 'mechanic', 'auto repair shop', 'auto glass shop'],
    "auto repair shops": ['car service station', 'car repair and maintenance service', 'auto body shop', 'auto bodywork mechanic', 'auto dent removal service station', 'auto painting', 'car service station', 'auto restoration service', 'oil change service', 'auto air conditioning service', 'car inspection station', 'car repair and maintenance service', 'smog inspection station', 'vehicle inspection service', 'no category', 'mechanic', 'auto repair shop', 'auto glass shop'],
    "motels": ['hotel', 'inn', 'motel', 'extended stay hotel'],
    "motel": ['hotel', 'inn', 'motel', 'extended stay hotel'],
    "gym": ['gym','personal trainer', 'rock climbing gym', 'physical fitness program','fitness center', 'martial arts school', 'boxing gym', 'muay thai boxing gym', 'kickboxing school', 'kickboxing gym'],
    "gyms": ['gym','personal trainer', 'rock climbing gym', 'physical fitness program','fitness center', 'martial arts school', 'boxing gym', 'muay thai boxing gym', 'kickboxing school', 'kickboxing gym'],
    "warehouse":["warehouse", "manufacturer", "logistics service"],
    "warehouses":["warehouse", "manufacturer","manufacturers", "logistics service"],
    "factories":["manufacturer","manufacturers"],
    "factory":["manufacturer"]

}

# 'assisted living facility', 'retirement community', 'retirement home', 'rehabilitation center', 'nursing home', 'no category'
# 'middle school', 'high school', 'charter school', 'senior high school'
# 'no category', 'laundry', 'laundromat', 'laundry service'
# 'apartment building', 'apartment complex', 'condominium complex', 'townhome complex', 'apartment rental agency', 'apartments', 'townhouse complex', 'condominium rental agency', 'no category'
# 'car service station', 'car repair and maintenance service', 'auto body shop', 'auto bodywork mechanic', 'auto dent removal service station', 'auto painting', 'car service station', 'auto restoration service', 'oil change service', 'auto air conditioning service', 'car inspection station', 'car repair and maintenance service', 'smog inspection station', 'vehicle inspection service', 'no category', 'mechanic', 'auto repair shop', 'auto glass shop'
# 'rv park', 'campground', 'mobile home park', 'trailer park', 'no category'
# 'hotel', 'inn', 'motel', 'extended stay hotel'
# 'gym', 'personal trainer', 'rock climbing gym', 'physical fitness program', 'fitness center'










# Column widths for Excel file
column_widths = {
    "Type of Business": 20,
    "Sub-Category": 18,
    "Name of Business": 30,
    "Website": 35,
    "# of Reviews": 12,
    "Rating": 10,
    "Latest Review": 20,
    "Business Address": 50,
    "Phone Number": 15
}

# =================== DATA PROCESSING =================== #

def print_status(step_name, count):
    print(f"{step_name.ljust(40)}: {str(count).rjust(6)} leads left")

def print_filtered_categories(df_before, df_after, step_name):
    # Get the unique categories that were filtered out
    filtered_categories = set(df_before["Sub-Category"].unique()) - set(df_after["Sub-Category"].unique())
    if filtered_categories:
        print(f"Categories filtered out in '{step_name}': {', '.join(filtered_categories)}")
    else:
        print(f"No categories filtered out in '{step_name}'")

# Open the CSV file
df = pd.read_csv(file_path)
print_status("Initial leads count", df.shape[0])
df["Type of Business"] = df["Type of Business"].str.lower()
df["Sub-Category"] = df["Sub-Category"].str.lower()
# Rename "Latest Review Date" column to "Latest Review"
df.rename(columns={"Latest Review Date": "Latest Review"}, inplace=True)
print(df)
# Drop rows with unwanted values
filters = {
    "# of Reviews": 'No reviews',
    "Rating": 'No ratings',
    "Latest Review": 'No review date',
    "Phone Number": 'No phone number',
    "Business Address": 'No address'
}

for col, value in filters.items():
    df_before = df.copy()
    df = df[df[col] != value]
    print_status(f"After filtering '{col}' != '{value}'", df.shape[0])
    # print_filtered_categories(df_before, df, f"Filter '{col}' != '{value}'")

# Clean and convert numeric columns
df["# of Reviews"] = df["# of Reviews"].str.replace(',', '').astype(int)

# Remove "on Google" from 'Latest Review'
df["Latest Review"] = df["Latest Review"].str.replace(r'on\s*\n*Google', '', regex=True)

# Drop addresses without a comma
df_before = df.copy()
df = df[df["Business Address"].str.contains(",", na=False)]
print_status("After dropping addresses without a comma", df.shape[0])
# print_filtered_categories(df_before, df, "Drop addresses without a comma")

# Keep rows where '# of Reviews' is at least 4
df_before = df.copy()
df = df[df["# of Reviews"] >= 4]
print_status("After filtering reviews >= 4", df.shape[0])
# print_filtered_categories(df_before, df, "Filter reviews >= 4")

# Keep only rows where 'Latest Review' contains "ago"
df_before = df.copy()
df = df[df["Latest Review"].str.contains(r'\bago\b', case=False, na=False)]
print_status("After keeping 'Latest Review' with 'ago'", df.shape[0])
# print_filtered_categories(df_before, df, "Keep 'Latest Review' with 'ago'")

# Remove any text after "ago"
df["Latest Review"] = df["Latest Review"].str.extract(r'(.+?ago)')[0]

# Remove duplicate phone numbers
df_before = df.copy()
df = df.drop_duplicates(subset=["Phone Number"], keep='first')
print_status("After removing duplicate phone numbers", df.shape[0])
# print_filtered_categories(df_before, df, "Remove duplicate phone numbers")


# Apply US filter
df_before = df.copy()
df = df[df["Business Address"].str.contains('|'.join(US_Filter), case=True, na=False)]
print_status("After US filter", df.shape[0])
# print_filtered_categories(df_before, df, "US filter")


# # # Apply state filters
# df_before = df.copy()
# df = df[df["Business Address"].str.contains('|'.join(state_filters), case=True, na=False)]
# print_status("After state filter", df.shape[0])
# # print_filtered_categories(df_before, df, "State filter")

# # Filter based on city names
# df_before = df.copy()
# df = df[df["Business Address"].astype(str).str.contains('|'.join(city_names), case=False, na=False)]
# print_status("After city filter", df.shape[0])
# print_filtered_categories(df_before, df, "City filter")




# Apply business type and sub-category filters
# Only apply filters to business types that are specifically defined in business_filters
for business_type, valid_subcategories in business_filters.items():
    # Check if any of the leads have this specific business type
    business_type_lower = business_type.lower()
    has_matching_leads = df["Type of Business"].str.contains(business_type_lower, case=False, na=False).any()
    
    if has_matching_leads and valid_subcategories and len(valid_subcategories) > 0:
        df_before = df.copy()
        # Filter out leads where the Type of Business matches the filter key
        # BUT the Sub-Category is NOT in the allowed list
        mask = df["Type of Business"].str.contains(business_type_lower, case=False, na=False) & \
               ~df["Sub-Category"].str.contains('|'.join(valid_subcategories), case=False, na=False)
        df = df[~mask]
        print_status(f"After filtering '{business_type}' (has sub-category filters)", df.shape[0])
        print_filtered_categories(df_before, df, f"Filter '{business_type}' (has sub-category filters)")
    elif has_matching_leads:
        # Business type exists in data but no sub-category filters defined
        print_status(f"Skipping filter for '{business_type}' (no sub-category filters defined)", df.shape[0])

# For business types not in business_filters, no filtering is applied (they pass through as-is)
print_status("Final count after business type filtering", df.shape[0])

# Capitalize the first letter of each word in "Type of Business" and "Sub-Category"
df["Type of Business"] = df["Type of Business"].str.title()
df["Sub-Category"] = df["Sub-Category"].str.title()


# =================== SORTING LOGIC =================== #

# Define custom sorting priorities
def custom_sort_key(row):
    # Priority 1: RV parks, mobile home parks, trailer parks
    if row["Type of Business"].lower() in ["rv parks", "mobile home parks", "trailer parks","rv park", "mobile home park", "trailer park"]:
        return 3, row["Type of Business"], row["Sub-Category"]
    
    # Priority 2: High schools and middle schools
    elif row["Type of Business"].lower() in ["high school", "high schools", "middle school", "middle schools"]:
        return 2, row["Type of Business"], row["Sub-Category"]
    
    # Priority 3: All other business types
    else:
        return 1, row["Type of Business"], row["Sub-Category"]

# Apply custom sorting
df["Sort Key"] = df.apply(custom_sort_key, axis=1)
df = df.sort_values(by="Sort Key", ascending=True).drop(columns=["Sort Key"])

# =================== SAVE TO EXCEL =================== #

with pd.ExcelWriter(output_file, engine='xlsxwriter') as writer:
    df.to_excel(writer, index=False, sheet_name='Sheet1')

    # Get workbook and worksheet
    workbook = writer.book
    worksheet = writer.sheets['Sheet1']

    # Apply custom column widths
    for i, col in enumerate(column_widths.keys()):
        worksheet.set_column(i, i, column_widths[col])

print(f"File '{output_file}' saved successfully with custom column widths! ✅")
