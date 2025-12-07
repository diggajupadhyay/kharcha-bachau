#!/usr/bin/env python3
import re

with open('context/StoreContext.tsx', 'r') as f:
    lines = f.readlines()

# Fix addCustomCategory (around line 497-499)
for i in range(len(lines)):
    if 'const updatedCategories = [...customCategories, category];' in lines[i]:
        # Check if next lines need fixing
        if i+1 < len(lines) and 'setCustomCategoriesState' in lines[i+1]:
            if i+2 < len(lines) and 'await storage.saveCustomCategories' in lines[i+2]:
                # Replace the order
                lines[i+1] = '      // Save first, then update state only on success\n'
                lines[i+2] = '      await storage.saveCustomCategories(user, updatedCategories);\n'
                lines.insert(i+3, '      setCustomCategoriesState(updatedCategories);\n')
                break

# Fix updateCustomCategory (around line 526-530)
for i in range(len(lines)):
    if 'const updatedCategories = customCategories.map(c =>' in lines[i]:
        # Find the closing of map and check next lines
        j = i
        while j < len(lines) and ');' not in lines[j]:
            j += 1
        if j+1 < len(lines) and 'setCustomCategoriesState' in lines[j+1]:
            if j+2 < len(lines) and 'await storage.saveCustomCategories' in lines[j+2]:
                # Replace the order
                lines[j+1] = '      // Save first, then update state only on success\n'
                lines[j+2] = '      await storage.saveCustomCategories(user, updatedCategories);\n'
                lines.insert(j+3, '      setCustomCategoriesState(updatedCategories);\n')
                break

with open('context/StoreContext.tsx', 'w') as f:
    f.writelines(lines)

print("Fixed category functions")

