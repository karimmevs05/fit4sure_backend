require('dotenv').config();
const db = require('./src/config/db');

// Helper function to convert M.D format to 2026-M-D date
function parseDate(dateStr) {
  const [month, day] = dateStr.split('.').map(Number);
  return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Complete meal count data from your sheet
// Format: "M.D" (e.g., "1.18" = January 18, "7.19" = July 19)
const mealWeeks = [
  {
    week_label: '1.18',
    week_start_date: parseDate('1.18'),
    recipes: [
      { name: 'Chicken Kefta Pita and Mixed Vaggies', day: 'Monday', position: 1 },
      { name: 'Carnitas Pork, Corn and Potatoes', day: 'Monday', position: 2 },
      { name: 'Ground Beef Gochujang White Rice Vaggies', day: 'Monday', position: 3 },
      { name: 'Pesto Chicken, Potatoes, Veggies', day: 'Thursday', position: 1 },
      { name: 'Steak, Potatoes, asparagus', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0 },
      { name: 'Drew', monday: 0, thursday: 0 },
      { name: 'Bruce', monday: 2, thursday: 2 },
      { name: 'Joe', monday: 4, thursday: 4 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Andy', monday: 3, thursday: 3 },
      { name: 'Robert', monday: 3, thursday: 1 },
      { name: 'Brooke', monday: 2, thursday: 2 },
      { name: 'Zoey', monday: 3, thursday: 2 },
      { name: 'Airea', monday: 3, thursday: 1 }
    ]
  },
  {
    week_label: '1.25',
    week_start_date: parseDate('1.25'),
    recipes: [
      { name: 'Chicken Quinoa Sweet Potato Bowl', day: 'Monday', position: 1 },
      { name: 'BBQ pulled Pork, Potatoes, Green Beans', day: 'Monday', position: 2 },
      { name: 'Ground Turkey, Rice, Peppers', day: 'Monday', position: 3 },
      { name: 'Chicken fried Rice', day: 'Thursday', position: 1 },
      { name: 'Steak, Potatoes, mixed veggies', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0 },
      { name: 'Drew', monday: 2, thursday: 1 },
      { name: 'Bruce', monday: 2, thursday: 0 },
      { name: 'Joe', monday: 4, thursday: 4 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Andy', monday: 3, thursday: 0 },
      { name: 'Robert', monday: 3, thursday: 1 },
      { name: 'Brooke', monday: 2, thursday: 2 },
      { name: 'Zoey', monday: 3, thursday: 2 },
      { name: 'Airea', monday: 3, thursday: 1 }
    ]
  },
  {
    week_label: '2.1',
    week_start_date: parseDate('2.1'),
    recipes: [
      { name: 'Italian Chicken and Pasta', day: 'Monday', position: 1 },
      { name: 'Ground Beef Rice and Beans and corn', day: 'Monday', position: 2 },
      { name: 'Chicken Orzo Salad', day: 'Thursday', position: 1 },
      { name: 'Steak Potatoes, Green Beans', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0 },
      { name: 'Drew', monday: 2, thursday: 1 },
      { name: 'Bruce', monday: 2, thursday: 0 },
      { name: 'Joe', monday: 4, thursday: 4 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 2, thursday: 3 },
      { name: 'Andy', monday: 3, thursday: 3 },
      { name: 'Robert', monday: 2, thursday: 2 },
      { name: 'Brooke', monday: 2, thursday: 2 },
      { name: 'Zoey', monday: 3, thursday: 2 },
      { name: 'Airea', monday: 2, thursday: 2 }
    ]
  },
  {
    week_label: '2.8',
    week_start_date: parseDate('2.8'),
    recipes: [
      { name: 'Pork Tenderloins, Potatoes asparagus', day: 'Monday', position: 1 },
      { name: 'Chicken Rice and Peppers', day: 'Monday', position: 2 },
      { name: 'Quinoa beef Bowl', day: 'Thursday', position: 1 },
      { name: 'Chicken Potatoes Carrots', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0 },
      { name: 'Bruce', monday: 2, thursday: 0 },
      { name: 'Joe', monday: 4, thursday: 4 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Andy', monday: 3, thursday: 0 },
      { name: 'Robert', monday: 2, thursday: 2 },
      { name: 'Brooke', monday: 2, thursday: 2 },
      { name: 'Zoey', monday: 3, thursday: 2 },
      { name: 'Airea', monday: 2, thursday: 2 }
    ]
  },
  {
    week_label: '2.15',
    week_start_date: parseDate('2.15'),
    recipes: [
      { name: 'Chicken Potatoes carrots', day: 'Monday', position: 1 },
      { name: 'Thai basil ground beef Coconut Rice Carrots/asparagus', day: 'Monday', position: 2 },
      { name: 'Ground Turkey Pasta Zucchini', day: 'Monday', position: 3 },
      { name: 'Beef Kefta Turmeric Rice Chickpeas Peppers', day: 'Thursday', position: 1 },
      { name: 'Chicken Chimichurri', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0 },
      { name: 'Jane Doe', monday: 3, thursday: 2 },
      { name: 'Joe', monday: 4, thursday: 4 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 5, thursday: 2 },
      { name: 'Andy', monday: 0, thursday: 3 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '2.22',
    week_start_date: parseDate('2.22'),
    recipes: [
      { name: 'Chicken Potatoes carrots', day: 'Monday', position: 1 },
      { name: 'Thai basil ground beef Coconut Rice Carrots/asparagus', day: 'Monday', position: 2 },
      { name: 'Ground Turkey Pasta Zucchini', day: 'Monday', position: 3 },
      { name: 'Beef Kefta Turmeric Rice Chickpeas Peppers', day: 'Thursday', position: 1 },
      { name: 'Chicken Chimichurri Sweet Potatoes', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0 },
      { name: 'Jane Doe', monday: 3, thursday: 2 },
      { name: 'Joe', monday: 4, thursday: 4 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 5, thursday: 2 },
      { name: 'Andy', monday: 0, thursday: 3 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '3.1',
    week_start_date: parseDate('3.1'),
    recipes: [
      { name: 'Marinated Steak, Garlic & Herbes Potatoes, Green beans', day: 'Monday', position: 1 },
      { name: 'Chicken al pastor with cilantro lime rice, corn & bean salad', day: 'Monday', position: 2 },
      { name: 'Spinach Garlic Turkey Meatballs, Orzo Salad', day: 'Monday', position: 3 },
      { name: 'Sweet potato chimichurri beef bowl, corn & Zucchini, Pico', day: 'Thursday', position: 1 },
      { name: 'Chicken Fried Rice', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Joe', monday: 0, thursday: 0 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 5, thursday: 3 },
      { name: 'Chris', monday: 6, thursday: 4 },
      { name: 'Andy', monday: 3, thursday: 3 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '3.8',
    week_start_date: parseDate('3.8'),
    recipes: [
      { name: 'Jamaican Pineapple Jerk Chicken With Rice Peppers', day: 'Monday', position: 1 },
      { name: 'Chicken Kefta, Pita, Hummus, Peppers & Red onions', day: 'Monday', position: 2 },
      { name: 'Slow cooked balsamic chuck', day: 'Monday', position: 3 },
      { name: 'Ground beef Korean carrots', day: 'Thursday', position: 1 },
      { name: 'Balsamic chicken strawberry feta', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Joe', monday: 0, thursday: 0 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 6, thursday: 3 },
      { name: 'Chris', monday: 6, thursday: 4 },
      { name: 'Andy', monday: 0, thursday: 0 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '3.22',
    week_start_date: parseDate('3.22'),
    recipes: [
      { name: 'Ground beef chimichuri, Rice and Bean and Corn Salad', day: 'Monday', position: 1 },
      { name: 'Pasta turkey and Zucchini', day: 'Monday', position: 2 },
      { name: 'Chicken Potatoes and Carrottes', day: 'Monday', position: 3 },
      { name: 'Steak Sweet Potatoes Broccoli', day: 'Thursday', position: 1 },
      { name: 'Chicken shawarma', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Joe', monday: 0, thursday: 0 },
      { name: 'Ann', monday: 0, thursday: 0 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 5, thursday: 0 },
      { name: 'Chris', monday: 4, thursday: 4 },
      { name: 'Andy', monday: 3, thursday: 3 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '3.29',
    week_start_date: parseDate('3.29'),
    recipes: [
      { name: 'Ginger orange braised beef, Rice, Green beans', day: 'Monday', position: 1 },
      { name: 'Pork Tenderloin with creamy mustard Sauce Potatoes & Cauliflower', day: 'Monday', position: 2 },
      { name: 'Greek Chicken Quinoa Salad', day: 'Monday', position: 3 },
      { name: 'Garlic Spinach Turkey Meatballs, Lemon Parsley rice, Mixed veggies', day: 'Thursday', position: 1 },
      { name: 'Chicken Fried Rice', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Joe', monday: 0, thursday: 0 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 4, thursday: 3 },
      { name: 'Chris', monday: 6, thursday: 4 },
      { name: 'Andy', monday: 0, thursday: 0 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '4.5',
    week_start_date: parseDate('4.5'),
    recipes: [
      { name: 'Steak Taco Bowl Peppers', day: 'Monday', position: 1 },
      { name: 'Pasta Salad Grilled chicken', day: 'Monday', position: 2 },
      { name: 'Sweet Potato ground beef corn', day: 'Monday', position: 3 },
      { name: 'Slow cooked beef Potatoes Veggie', day: 'Thursday', position: 1 },
      { name: 'Quinoa Sweet Potato, Chicken with honey mustard', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Joe', monday: 0, thursday: 0 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 4, thursday: 3 },
      { name: 'Chris', monday: 6, thursday: 4 },
      { name: 'Andy', monday: 0, thursday: 0 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '4.12',
    week_start_date: parseDate('4.12'),
    recipes: [
      { name: 'Cuban Mojo Pork Rice bowl with corn & Bean salad Aji verde', day: 'Monday', position: 1 },
      { name: 'Chicken Kefta, Lemon Dill Potatoes , Broccoli, Yogurt Sauce', day: 'Monday', position: 2 },
      { name: 'Ginger Lime Ground Turkey with coconut rice & Asparagus & Peppers', day: 'Monday', position: 3 },
      { name: 'BBQ Orange Chicken with Gochujang Potatoes & Carrots', day: 'Thursday', position: 1 },
      { name: 'Mediterranean Ground Beef stir fry with mixed veggies', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 1, thursday: 2 },
      { name: 'Chris', monday: 2, thursday: 4 },
      { name: 'Andy', monday: 0, thursday: 3 },
      { name: 'Henning', monday: 9, thursday: 7 }
    ]
  },
  {
    week_label: '4.19',
    week_start_date: parseDate('4.19'),
    recipes: [
      { name: 'Korean BBQ Beef with Broccoli & Sweet Potato Trio', day: 'Monday', position: 1 },
      { name: 'Greek Chicken Dill Feta Vinaigrette & Orzo', day: 'Monday', position: 2 },
      { name: 'Slow Cooked Orange ginger beef & rice with mixed veggies', day: 'Monday', position: 3 }
    ],
    customers: [
      { name: 'Drew', monday: 0, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 0 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 0 },
      { name: 'Joe', monday: 0, thursday: 0 },
      { name: 'Ann', monday: 4, thursday: 0 },
      { name: 'Daniel K', monday: 6, thursday: 0 },
      { name: 'Sydney', monday: 6, thursday: 0 },
      { name: 'Chris', monday: 6, thursday: 0 },
      { name: 'Andy', monday: 0, thursday: 0 },
      { name: 'Henning', monday: 15, thursday: 0 }
    ]
  },
  {
    week_label: '4.26',
    week_start_date: parseDate('4.26'),
    recipes: [
      { name: 'Marinated Steak & Potatoes, Broccoli', day: 'Monday', position: 1 },
      { name: 'Chicken & Pasta Al Limone with zucchini', day: 'Monday', position: 2 },
      { name: 'Greek Ground turkey yellow rice mixed veggies', day: 'Monday', position: 3 },
      { name: 'Kale Quinoa Salad with beef meatballs', day: 'Thursday', position: 1 },
      { name: 'Chipotle lime Chicken Taco Bowl', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 3, thursday: 2 },
      { name: 'Chris', monday: 4, thursday: 0 },
      { name: 'Andy', monday: 3, thursday: 3 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '5.3',
    week_start_date: parseDate('5.3'),
    recipes: [
      { name: 'Chicken with roasted potatoes and peppers', day: 'Monday', position: 1 },
      { name: 'Slow cooked beef with rice & veggies', day: 'Monday', position: 2 },
      { name: 'Ground beef chimichurri sweet potato trio veggie', day: 'Monday', position: 3 },
      { name: 'Spinach garlic turkey meatballs', day: 'Thursday', position: 1 },
      { name: 'Chicken fried rice', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Sydney', monday: 0, thursday: 0 },
      { name: 'Chris', monday: 2, thursday: 2 },
      { name: 'Andy', monday: 3, thursday: 0 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 8, thursday: 8 }
    ]
  },
  {
    week_label: '5.10',
    week_start_date: parseDate('5.10'),
    recipes: [
      { name: 'BBQ chicken Potatoes, Zucchini', day: 'Monday', position: 1 },
      { name: 'Mojo Pork, Yuka Southwestern corn & Sauce', day: 'Monday', position: 2 },
      { name: 'Steak Shawarma, Yellow Rice, Chickpeas, Peppers', day: 'Monday', position: 3 },
      { name: 'Tuscan Chicken with orzo salad', day: 'Thursday', position: 1 },
      { name: 'Ground beef sweet potato bowl with broccoli', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 2, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 2, thursday: 2 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 0, thursday: 4 },
      { name: 'Chris', monday: 2, thursday: 5 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 8, thursday: 0 }
    ]
  },
  {
    week_label: '5.17',
    week_start_date: parseDate('5.17'),
    recipes: [
      { name: 'Steak Taco Bowl', day: 'Monday', position: 1 },
      { name: 'Creamy Ground turkey Pasta with zucchini', day: 'Monday', position: 2 },
      { name: 'Mustard Chicken & Potatoes Asparagus', day: 'Monday', position: 3 },
      { name: 'Braised french chuck Potatoes Cauliflower', day: 'Thursday', position: 1 },
      { name: 'Orange Cilantro chicken Quinoa Salad', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 0 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 0 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Chris', monday: 4, thursday: 4 },
      { name: 'Felicia - Normal', monday: 4, thursday: 0 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 0 },
      { name: 'Henning', monday: 8, thursday: 7 }
    ]
  },
  {
    week_label: '5.24',
    week_start_date: parseDate('5.24'),
    recipes: [
      { name: 'Greek Ground Turkey Yellow Rice Peppers Yogurt Sauce', day: 'Monday', position: 1 },
      { name: 'Pesto Chicken & Potatoes, Asparagus', day: 'Monday', position: 2 },
      { name: 'Korean Ground Beef Sweet Potato Bowl with broccoli', day: 'Monday', position: 3 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 4, thursday: 0 },
      { name: 'Mr. Kelly LARGE', monday: 4, thursday: 0 },
      { name: 'Ann', monday: 3, thursday: 0 },
      { name: 'Daniel K', monday: 3, thursday: 0 },
      { name: 'Chris', monday: 0, thursday: 0 },
      { name: 'Felicia - Normal', monday: 5, thursday: 0 },
      { name: 'Felicia - No Carbs', monday: 5, thursday: 0 },
      { name: 'Henning', monday: 9, thursday: 0 }
    ]
  },
  {
    week_label: '5.31',
    week_start_date: parseDate('5.31'),
    recipes: [
      { name: 'Coffee marinated steak, Potatoes & Green Beans', day: 'Monday', position: 1 },
      { name: 'Chicken Pesto Pasta Salad tomatoes', day: 'Monday', position: 2 },
      { name: 'Asian Braised Pork, white rice, Rainbow carrots', day: 'Monday', position: 3 },
      { name: 'Beef Kefta, lemon dill rice, Peppers & Yogurt sauce', day: 'Thursday', position: 1 },
      { name: 'Blackened chicken quinoa sweet potato bowl, parsley cauliflower', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 2, thursday: 1 },
      { name: 'Kelly', monday: 4, thursday: 1 },
      { name: 'Mr. Kelly LARGE', monday: 4, thursday: 1 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Andy', monday: 3, thursday: 3 },
      { name: 'Daniel K', monday: 0, thursday: 0 },
      { name: 'Chris', monday: 2, thursday: 4 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 8, thursday: 8 }
    ]
  },
  {
    week_label: '6.7',
    week_start_date: parseDate('6.7'),
    recipes: [
      { name: 'Spinach Garlic Turkey Meatballs, Potatoes, Asparagus', day: 'Monday', position: 1 },
      { name: 'Honey Lime chicken & Rice, corn & mango salsa', day: 'Monday', position: 2 },
      { name: 'Korean Ground beef, Sweet potato Trio, Broccoli', day: 'Monday', position: 3 },
      { name: 'Balsamic Braised Beef with Potatoes & Mixed Veggies', day: 'Thursday', position: 1 },
      { name: 'Creamy Tomato Garlic Pasta, Tuscan Chicken, Zucchini', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 2, thursday: 1 },
      { name: 'Kelly', monday: 1, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 2 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Andy', monday: 0, thursday: 3 },
      { name: 'Daniel K', monday: 4, thursday: 2 },
      { name: 'Chris', monday: 0, thursday: 0 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 10, thursday: 8 },
      { name: 'Zoey', monday: 2, thursday: 0 }
    ]
  },
  {
    week_label: '6.14',
    week_start_date: parseDate('6.14'),
    recipes: [
      { name: 'Lemon Chicken Zaatar potatoes, Veggies', day: 'Monday', position: 1 },
      { name: 'Mediterranean Ground Turkey, Quinoa&Tomatoes hot honey pickled onions', day: 'Monday', position: 2 },
      { name: 'Chicken Fried Rice', day: 'Thursday', position: 1 },
      { name: 'Ginger Orange shredded beef sweet potato bowl, asparagus', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 0, thursday: 0 },
      { name: 'Kelly', monday: 1, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 2 },
      { name: 'Ann', monday: 3, thursday: 2 },
      { name: 'Andy', monday: 0, thursday: 3 },
      { name: 'Daniel K', monday: 3, thursday: 3 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 8, thursday: 6 },
      { name: 'Zoey', monday: 0, thursday: 2 }
    ]
  },
  {
    week_label: '6.21',
    week_start_date: parseDate('6.21'),
    recipes: [
      { name: 'Steak Taco Bowl', day: 'Monday', position: 1 },
      { name: 'Orange Cilantro Chicken, Potatoes & Peppers, Aji verde', day: 'Monday', position: 2 },
      { name: 'Creamy Lemon Spinach Turkey Pasta', day: 'Monday', position: 3 }
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0 },
      { name: 'Kelly', monday: 3, thursday: 0 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 0 },
      { name: 'Ann', monday: 3, thursday: 0 },
      { name: 'Andy', monday: 0, thursday: 0 },
      { name: 'Daniel K', monday: 6, thursday: 0 },
      { name: 'Felicia - Normal', monday: 4, thursday: 0 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 0 },
      { name: 'Henning', monday: 15, thursday: 0 }
    ]
  },
  {
    week_label: '7.5',
    week_start_date: parseDate('7.5'),
    recipes: [
      { name: 'Chicken Pasta', day: 'Monday', position: 1 },
      { name: 'Greek Ground Turkey', day: 'Monday', position: 2 },
      { name: 'Ground beef chimichurri sweet potato', day: 'Thursday', position: 1 },
      { name: 'Chicken Peruvian', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 2, thursday: 1 },
      { name: 'Kelly', monday: 3, thursday: 2 },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2 },
      { name: 'Ann', monday: 2, thursday: 2 },
      { name: 'Andy', monday: 0, thursday: 4 },
      { name: 'Daniel K', monday: 3, thursday: 2 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 6, thursday: 6 },
      { name: 'Zoey', monday: 0, thursday: 0 }
    ]
  },
  {
    week_label: '7.12',
    week_start_date: parseDate('7.12'),
    recipes: [
      { name: 'Chicken Kefta Parsley Rice', day: 'Monday', position: 1 },
      { name: 'Turkey Meatballs Potatoes Zucchini', day: 'Monday', position: 2 },
      { name: 'Orzo salad chicken', day: 'Thursday', position: 1 },
      { name: 'Braised beef & rice', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 1, thursday: 2 },
      { name: 'Kelly', monday: 1, thursday: 3 },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 3 },
      { name: 'Ann', monday: 2, thursday: 2 },
      { name: 'Andy', monday: 0, thursday: 4 },
      { name: 'Daniel K', monday: 2, thursday: 4 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 6, thursday: 6 },
      { name: 'Zoey', monday: 0, thursday: 0 }
    ]
  },
  {
    week_label: '7.19',
    week_start_date: parseDate('7.19'),
    recipes: [
      { name: 'Marinated Steak & Potatoes Green Beans', day: 'Monday', position: 1 },
      { name: 'Quinoa Salad Chicken', day: 'Monday', position: 2 },
      { name: 'Chicken Fried Rice', day: 'Thursday', position: 1 },
      { name: 'Creamy Lemon Turkey Pasta', day: 'Thursday', position: 2 }
    ],
    customers: [
      { name: 'Drew', monday: 0, thursday: 0 },
      { name: 'Kelly', monday: 1, thursday: 3 },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 3 },
      { name: 'Ann', monday: 2, thursday: 2 },
      { name: 'Andy', monday: 0, thursday: 4 },
      { name: 'Daniel K', monday: 2, thursday: 4 },
      { name: 'Felicia - Normal', monday: 4, thursday: 2 },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2 },
      { name: 'Henning', monday: 6, thursday: 6 },
      { name: 'Zoey', monday: 0, thursday: 0 }
    ]
  }
];

async function loadMealData() {
  try {
    console.log('📋 Loading all meal count data (M.D format → 2026-M-D dates)...\n');

    // 1. Create all customers
    console.log('👥 Customers:');
    const allCustomers = new Set();
    mealWeeks.forEach(week => {
      week.customers.forEach(c => allCustomers.add(c.name));
    });

    const customerMap = {};
    for (const customerName of allCustomers) {
      const result = await db.query(
        `INSERT INTO customers (name, sales_pipeline_stage, created_at)
         VALUES ($1, 'active', NOW())
         ON CONFLICT (name) DO UPDATE SET name = $1
         RETURNING id, name`,
        [customerName]
      );
      customerMap[customerName] = result.rows[0].id;
    }
    console.log(`  ✓ ${allCustomers.size} customers\n`);

    // 2. Load each week
    for (const week of mealWeeks) {
      const menuResult = await db.query(
        `INSERT INTO menus (week_label, week_start_date, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (week_label) DO UPDATE SET week_label = $1
         RETURNING id`,
        [week.week_label, week.week_start_date]
      );
      const menuId = menuResult.rows[0].id;

      // Create recipes
      for (const recipe of week.recipes) {
        await db.query(
          `INSERT INTO menu_recipes (menu_id, recipe_name, day_of_week, position, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id`,
          [menuId, recipe.name, recipe.day, recipe.position]
        );
      }

      // Create order totals
      let customerCount = 0;
      let mealCount = 0;
      for (const customer of week.customers) {
        const customerId = customerMap[customer.name];
        const totalMeals = (customer.monday || 0) + (customer.thursday || 0);

        if (totalMeals > 0) {
          customerCount++;
          mealCount += totalMeals;

          const existing = await db.query(
            `SELECT id FROM order_totals WHERE menu_id = $1 AND customer_id = $2`,
            [menuId, customerId]
          );

          if (existing.rows.length > 0) {
            await db.query(
              `UPDATE order_totals
               SET total_meals_monday = $1, total_meals_thursday = $2, total_meals = $3
               WHERE menu_id = $4 AND customer_id = $5`,
              [customer.monday || 0, customer.thursday || 0, totalMeals, menuId, customerId]
            );
          } else {
            await db.query(
              `INSERT INTO order_totals (menu_id, customer_id, total_meals_monday, total_meals_thursday, total_meals, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())`,
              [menuId, customerId, customer.monday || 0, customer.thursday || 0, totalMeals]
            );
          }
        }
      }

      console.log(`📅 ${week.week_label} (${week.week_start_date}): ${week.recipes.length} recipes, ${customerCount} customers, ${mealCount} meals`);
    }

    const totalMeals = mealWeeks.reduce((sum, w) => {
      return sum + w.customers.reduce((s, c) => s + (c.monday || 0) + (c.thursday || 0), 0);
    }, 0);

    console.log('\n✅ Complete! All weeks loaded with correct dates.\n');
    console.log('📊 Summary:');
    console.log(`  • 25 weeks of data (Jan–Jul 2026)`);
    console.log(`  • ${allCustomers.size} customers`);
    console.log(`  • ${totalMeals} total meals`);
    console.log(`  • Latest: 7.19 (2026-07-19)\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

loadMealData();
