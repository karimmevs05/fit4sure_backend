require('dotenv').config();
const db = require('./src/config/db');

// Complete order data from all weeks in your spreadsheet
const allOrderData = {
  'Week of 1.18': {
    recipes: [
      { name: 'Chicken Kefta Pita and Mixed Vaggies', day: 'Monday' },
      { name: 'Carnitas Pork, Corn and Potatoes', day: 'Monday' },
      { name: 'Ground Beef Gochujang White Rice Vaggies', day: 'Monday' },
      { name: 'Pesto Chicken, Potatoes, Veggies', day: 'Thursday' },
      { name: 'Steak, Potatoes, asparagus', day: 'Thursday' },
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0, notes: '3 lbs of Chicken only' },
      { name: 'Drew', monday: 0, thursday: 0, notes: 'No Quinoa' },
      { name: 'Bruce', monday: 2, thursday: 2, notes: 'No Quinoa, broccoli, tomatoes, corn, no porc, no turkey' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Andy', monday: 3, thursday: 3, notes: '' },
      { name: 'Robert', monday: 3, thursday: 1, notes: 'Trying to eat more proteine' },
      { name: 'Brooke', monday: 2, thursday: 2, notes: 'No beef no pork' },
      { name: 'Zoey', monday: 3, thursday: 2, notes: 'High protein non allergies' },
      { name: 'Airea', monday: 3, thursday: 1, notes: 'High protein non allergies' },
    ],
  },
  'Week of 1.25': {
    recipes: [
      { name: 'Chicken Quinoa Sweet Potato Bowl', day: 'Monday' },
      { name: 'BBQ pulled Porc, Potatoes, Green Beans', day: 'Monday' },
      { name: 'Ground Turkey, Rice, Peppers', day: 'Monday' },
      { name: 'Chicken fried Rice', day: 'Thursday' },
      { name: 'Steak, Potatoes, mixed veggies', day: 'Thursday' },
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0, notes: '3 lbs of Chicken only' },
      { name: 'Drew', monday: 2, thursday: 1, notes: 'No Quinoa' },
      { name: 'Bruce', monday: 2, thursday: 0, notes: 'No Quinoa, broccoli, tomatoes, corn, no porc, no turkey' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Andy', monday: 3, thursday: 0, notes: '' },
      { name: 'Robert', monday: 3, thursday: 1, notes: 'Trying to eat more proteine' },
      { name: 'Brooke', monday: 2, thursday: 2, notes: 'No beef no pork' },
      { name: 'Zoey', monday: 3, thursday: 2, notes: 'High protein non allergies' },
      { name: 'Airea', monday: 3, thursday: 1, notes: 'High protein non allergies' },
    ],
  },
  'Week of 2.1': {
    recipes: [
      { name: 'Italian Chicken and Pasta', day: 'Monday' },
      { name: 'Ground Beef Rice and Beans and corn', day: 'Monday' },
      { name: 'Chicken Orzo Salad', day: 'Thursday' },
      { name: 'Steak Potatoes, Green Beans', day: 'Thursday' },
    ],
    customers: [
      { name: 'Alejandro', monday: 0, thursday: 0, notes: '3 lbs of Chicken only' },
      { name: 'Drew', monday: 2, thursday: 1, notes: 'No Quinoa' },
      { name: 'Bruce', monday: 2, thursday: 0, notes: 'No Quinoa, broccoli, tomatoes, corn, no porc, no turkey' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 2, thursday: 3, notes: 'no broccoli' },
      { name: 'Andy', monday: 3, thursday: 3, notes: '' },
      { name: 'Robert', monday: 2, thursday: 2, notes: 'Trying to eat more proteine' },
      { name: 'Brooke', monday: 2, thursday: 2, notes: 'No beef no pork' },
      { name: 'Zoey', monday: 3, thursday: 2, notes: 'High protein non allergies' },
      { name: 'Airea', monday: 2, thursday: 2, notes: 'High protein non allergies' },
    ],
  },
  'Week of 2.8': {
    recipes: [
      { name: 'Porc Tenderloines, Potatoes asperagus', day: 'Monday' },
      { name: 'Chicken Rice and Peppers', day: 'Monday' },
      { name: 'Quinoa beef Bowl', day: 'Thursday' },
      { name: 'Chicken Potatoes Carrots', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0, notes: 'No Quinoa' },
      { name: 'Bruce', monday: 2, thursday: 0, notes: 'No Quinoa, broccoli, tomatoes, corn, no porc, no turkey' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Andy', monday: 3, thursday: 0, notes: '' },
      { name: 'Robert', monday: 2, thursday: 2, notes: 'Trying to eat more proteine' },
      { name: 'Brooke', monday: 2, thursday: 2, notes: 'No beef no pork' },
      { name: 'Zoey', monday: 3, thursday: 2, notes: 'High protein non allergies' },
      { name: 'Airea', monday: 2, thursday: 2, notes: 'High protein non allergies' },
    ],
  },
  'Week of 2.15': {
    recipes: [
      { name: 'Chicken Potatoess arrots', day: 'Monday' },
      { name: 'Thai basil ground beef Coconut Rice Carrots/wsperge', day: 'Monday' },
      { name: 'Ground Turkey Pasta Zucchini', day: 'Monday' },
      { name: 'Beef Kefta Turmeric Rice Chickpeas Peppers', day: 'Thursday' },
      { name: 'Chicken Chimichurri', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0, notes: 'No Quinoa' },
      { name: 'Jane Doe', monday: 3, thursday: 2, notes: '' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 5, thursday: 2, notes: 'No Zucchini' },
      { name: 'Andy', monday: 0, thursday: 3, notes: '' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 2.22': {
    recipes: [
      { name: 'Chicken Potatoess arrots', day: 'Monday' },
      { name: 'Thai basil ground beef Coconut Rice Carrots/wsperge', day: 'Monday' },
      { name: 'Ground Turkey Pasta Zucchini', day: 'Monday' },
      { name: 'Beef Kefta Turmeric Rice Chickpeas Peppers', day: 'Thursday' },
      { name: 'Chicken Chimichurri Sweet Potatoes', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0, notes: 'No Quinoa' },
      { name: 'Jane Doe', monday: 3, thursday: 2, notes: '' },
      { name: 'Joe', monday: 4, thursday: 4, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 5, thursday: 2, notes: 'No Zucchini' },
      { name: 'Andy', monday: 0, thursday: 3, notes: '' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 3.1': {
    recipes: [
      { name: 'Marinated Steak, Garlic & Herbes Potatoes, Green beans', day: 'Monday' },
      { name: 'Chicken al pastor with cilantro lime rice, corn & bean salad', day: 'Monday' },
      { name: 'Spinach Garlic Turkey Meatballs, Orzo Salad (Peppers, sundried, zucchini)', day: 'Monday' },
      { name: 'Sweet potato chimichurri beef bowl, corn & Zucchini, Pico', day: 'Thursday' },
      { name: 'Chicken Fried Rice (Broccoli, Edamame, carrots)', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Joe', monday: 0, thursday: 0, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 5, thursday: 3, notes: 'No Zucchini' },
      { name: 'Chris', monday: 6, thursday: 4, notes: '' },
      { name: 'Andy', monday: 3, thursday: 3, notes: '' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 3.8': {
    recipes: [
      { name: 'Jamaican Pineapple Jerk Chicken With Rice Peppers', day: 'Monday' },
      { name: 'Chicken Kefta, Pita, Hummus, Peppers & Red onions', day: 'Monday' },
      { name: 'Slow cooked balsamic chuck with', day: 'Monday' },
      { name: 'Ground beef Korean carrrots', day: 'Thursday' },
      { name: 'Balsamic chicken strawberry feta', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Joe', monday: 0, thursday: 0, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 6, thursday: 3, notes: 'No Zucchini' },
      { name: 'Chris', monday: 6, thursday: 4, notes: '' },
      { name: 'Andy', monday: 0, thursday: 0, notes: '' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 3.22': {
    recipes: [
      { name: 'Ground beef chimichuri, Rice and Bean and Corn Salad', day: 'Monday' },
      { name: 'Pasta turkey and Zucchini', day: 'Monday' },
      { name: 'Chicken Potatoes and Carrottes', day: 'Monday' },
      { name: 'Steak Sweet Potatoes Broccoli', day: 'Thursday' },
      { name: 'chicken shawarma', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Joe', monday: 0, thursday: 0, notes: '' },
      { name: 'Ann', monday: 0, thursday: 0, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 5, thursday: 0, notes: 'No Zucchini' },
      { name: 'Chris', monday: 4, thursday: 4, notes: '' },
      { name: 'Andy', monday: 3, thursday: 3, notes: '' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 3.29': {
    recipes: [
      { name: 'Ginger orange braised beef, Rice, Green beans', day: 'Monday' },
      { name: 'Porc Tenderloin with creamy mustard Sauce Potatoes & Cauliflower', day: 'Monday' },
      { name: 'Greek Chicken Quinoa Salad (Carrots, Peppers, zucchini)', day: 'Monday' },
      { name: 'Garlic Spinach Turkey Meatballs, Lemon Parsley rice, Mixed veggies', day: 'Thursday' },
      { name: 'Chicken Fried Rice', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 4, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Joe', monday: 0, thursday: 0, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 4, thursday: 3, notes: 'No Zucchini' },
      { name: 'Chris', monday: 6, thursday: 4, notes: '' },
      { name: 'Andy', monday: 0, thursday: 0, notes: '' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 4.5': {
    recipes: [
      { name: 'Steak Taco Bowl Peppers', day: 'Monday' },
      { name: 'Pasta Salad Grilled chicken', day: 'Monday' },
      { name: 'Sweet Potato ground beef corn', day: 'Monday' },
      { name: 'Slow cooked beef Potatoes Veggie', day: 'Thursday' },
      { name: 'Quinoa Sweet Potato, Chicken with honey mustard', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Joe', monday: 0, thursday: 0, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 4, thursday: 3, notes: 'No Zucchini' },
      { name: 'Chris', monday: 6, thursday: 4, notes: '' },
      { name: 'Andy', monday: 0, thursday: 0, notes: '' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 4.12': {
    recipes: [
      { name: 'Cuban Mojo Porc Rice bowl with corn & Bean salad Aji verde', day: 'Monday' },
      { name: 'Chicken Kefta, Lemon Dill Potatoes , Broccoli, Yogurt Sauce', day: 'Monday' },
      { name: 'Ginger Lime Ground Turkey with coconut rice & Asparagus & Peppers', day: 'Monday' },
      { name: 'BBQ Orange Chicken with Gochujang Potatoes & Carroots', day: 'Thursday' },
      { name: 'Mediteranean Ground Beef stir fry with mixed veggies', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 1, thursday: 2, notes: 'No Zucchini' },
      { name: 'Chris', monday: 2, thursday: 4, notes: 'No Carrots' },
      { name: 'Andy', monday: 0, thursday: 3, notes: '' },
      { name: 'Henning', monday: 9, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 4.19': {
    recipes: [
      { name: 'Korean BBQ Beef with Broccoli & Sweet Potato Trio', day: 'Monday' },
      { name: 'Greek Ckicken Dill Feta Vinaigrette & Orzo', day: 'Monday' },
      { name: 'Slow Cooked Orange ginger beef & rice with mixed veggis', day: 'Monday' },
    ],
    customers: [
      { name: 'Drew', monday: 0, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 0, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 0, notes: '' },
      { name: 'Joe', monday: 0, thursday: 0, notes: '' },
      { name: 'Ann', monday: 4, thursday: 0, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 6, thursday: 0, notes: 'no broccoli' },
      { name: 'Sydney', monday: 6, thursday: 0, notes: 'No Zucchini' },
      { name: 'Chris', monday: 6, thursday: 0, notes: '' },
      { name: 'Andy', monday: 0, thursday: 0, notes: '' },
      { name: 'Henning', monday: 15, thursday: 0, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 4.26': {
    recipes: [
      { name: 'Marinated Steak & Potatoes, Broccoli', day: 'Monday' },
      { name: 'Chicken & Pasta Al Limone with zucchini', day: 'Monday' },
      { name: 'Greek Ground turkey yellow rice mixed veggies', day: 'Monday' },
      { name: 'Kale Quinoa Salad with beef meatballs', day: 'Thursday' },
      { name: 'Chipotle lime Chicken Taco Bowl (Pico)', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 3, thursday: 2, notes: 'No Zucchini, broccoli' },
      { name: 'Chris', monday: 4, thursday: 0, notes: '' },
      { name: 'Andy', monday: 3, thursday: 3, notes: 'give him green beans and carrottes for one of them' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 5.3': {
    recipes: [
      { name: 'Chicken with roasted potatoes and peppers', day: 'Monday' },
      { name: 'Slow cooked beef with rice & veggies', day: 'Monday' },
      { name: 'Ground beef chimichurri sweet potato trio veggie', day: 'Monday' },
      { name: 'Spinach garlic turkey meatballs', day: 'Thursday' },
      { name: 'Chicken fried rice', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Sydney', monday: 0, thursday: 0, notes: 'No Zucchini' },
      { name: 'Chris', monday: 2, thursday: 2, notes: '' },
      { name: 'Andy', monday: 3, thursday: 0, notes: '' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '6 oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '5 oz' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 5.10': {
    recipes: [
      { name: 'BBQ chicken Potatoes, Zucchini', day: 'Monday' },
      { name: 'Mojo Porc, Yuka Southwestern corn & Sauce', day: 'Monday' },
      { name: 'Steak Shawarma, Yelllow Rice, Chickpeas, Peppers', day: 'Monday' },
      { name: 'Tuscan Chicken with orzo salad', day: 'Thursday' },
      { name: 'Ground beef sweet potato bowl with broccoli', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 2, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 2, thursday: 2, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 0, thursday: 4, notes: 'no broccoli' },
      { name: 'Chris', monday: 2, thursday: 5, notes: '' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '6 oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '5 oz' },
      { name: 'Henning', monday: 8, thursday: 0, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 5.17': {
    recipes: [
      { name: 'Steak Taco Bowl', day: 'Monday' },
      { name: 'Creamy Ground turkey Pasta with zucchini', day: 'Monday' },
      { name: 'Mustard Chicken & Potatoes Asparagus', day: 'Monday' },
      { name: 'Braised french chuck Potatoes Cauliflower', day: 'Thursday' },
      { name: 'Orange Cilantro chicken Quinoa Salad', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 0, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 0, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Chris', monday: 4, thursday: 4, notes: '' },
      { name: 'Felicia - Normal', monday: 4, thursday: 0, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 0, notes: '4oz' },
      { name: 'Henning', monday: 8, thursday: 7, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 5.24': {
    recipes: [
      { name: 'Greek Ground Turkey Yellow Rice Peppers Yogurt Sauce', day: 'Monday' },
      { name: 'Pesto Chicken & Potatoes, Asparagus', day: 'Monday' },
      { name: 'Korean Ground Beef Sweet Potato Bowl with broccoli', day: 'Monday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 4, thursday: 0, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 4, thursday: 0, notes: '' },
      { name: 'Ann', monday: 3, thursday: 0, notes: 'No beans, no gluten, no dairy' },
      { name: 'Daniel K', monday: 3, thursday: 0, notes: 'no broccoli' },
      { name: 'Chris', monday: 0, thursday: 0, notes: '' },
      { name: 'Felicia - Normal', monday: 5, thursday: 0, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 5, thursday: 0, notes: '4oz' },
      { name: 'Henning', monday: 9, thursday: 0, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 5.31': {
    recipes: [
      { name: 'Coffee marinated steak, Potatoes & Green Beans', day: 'Monday' },
      { name: 'Chicken Pesto Pasta Salad tomatoes', day: 'Monday' },
      { name: 'Asian Braised Pork, white rice, Rainbow carrots', day: 'Monday' },
      { name: 'Beef Kefta, lemon dill rice, Peppers & Yogurt sauce', day: 'Thursday' },
      { name: 'Blackened chicken quinoa sweet potato bowl, parsley cauliflower', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 2, thursday: 1, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 4, thursday: 1, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 4, thursday: 1, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Andy', monday: 3, thursday: 3, notes: 'High Protein no carbs' },
      { name: 'Daniel K', monday: 0, thursday: 0, notes: 'no broccoli' },
      { name: 'Chris', monday: 2, thursday: 4, notes: '' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '4oz' },
      { name: 'Henning', monday: 8, thursday: 8, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 6.7': {
    recipes: [
      { name: 'Spinach Garlic Turkey Meatballs, Potatoes, Asparagus', day: 'Monday' },
      { name: 'Honey Lime chicken & Rice, corn & mango salsa', day: 'Monday' },
      { name: 'Korean Ground beef, Sweet potato Trio, Broccoli', day: 'Monday' },
      { name: 'Balsamic Braised Beef with Potatoes & Mixed Veggies', day: 'Thursday' },
      { name: 'Creamy Tomato Garlic Pasta, Tuscan Chicken, Zucchini', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 2, thursday: 1, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 1, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 2, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Andy', monday: 0, thursday: 3, notes: 'High Protein no carbs' },
      { name: 'Daniel K', monday: 4, thursday: 2, notes: 'no broccoli' },
      { name: 'Chris', monday: 0, thursday: 0, notes: '' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '4oz' },
      { name: 'Henning', monday: 10, thursday: 8, notes: 'Trying to eat more proteine' },
      { name: 'Zoey', monday: 2, thursday: 0, notes: '' },
    ],
  },
  'Week of 6.14': {
    recipes: [
      { name: 'Lemon Chicken Zaatar potatoes, Veggies', day: 'Monday' },
      { name: 'Mediteranean Ground Turkey, Quinoa&Tomatoes hot honey pickled onions', day: 'Monday' },
      { name: 'Chicken Fried Rice', day: 'Thursday' },
      { name: 'Ginger Orange shredded beef sweet potato bowl, asparagus', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 0, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 1, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 2, notes: '' },
      { name: 'Ann', monday: 3, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Andy', monday: 0, thursday: 3, notes: 'High Protein no carbs' },
      { name: 'Daniel K', monday: 3, thursday: 3, notes: 'no broccoli' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '4oz' },
      { name: 'Henning', monday: 8, thursday: 6, notes: 'Trying to eat more proteine' },
      { name: 'Zoey', monday: 0, thursday: 2, notes: '' },
    ],
  },
  'Week of 6.21': {
    recipes: [
      { name: 'Steak Taco Bowl', day: 'Monday' },
      { name: 'Orange Cilantro Chicken, Potatoes & Peppers, Aji verde', day: 'Monday' },
      { name: 'Creamy Lemon Spinach Turkey Pasta', day: 'Monday' },
    ],
    customers: [
      { name: 'Drew', monday: 3, thursday: 0, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 0, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 0, notes: '' },
      { name: 'Ann', monday: 3, thursday: 0, notes: 'No beans, no gluten, no dairy' },
      { name: 'Andy', monday: 0, thursday: 0, notes: 'High Protein no carbs' },
      { name: 'Daniel K', monday: 6, thursday: 0, notes: 'no broccoli' },
      { name: 'Felicia - Normal', monday: 4, thursday: 0, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 0, notes: '4oz' },
      { name: 'Henning', monday: 15, thursday: 0, notes: 'Trying to eat more proteine' },
    ],
  },
  'Week of 7.5': {
    recipes: [
      { name: 'Chicken Pasta', day: 'Monday' },
      { name: 'Greek Ground Turkey', day: 'Monday' },
      { name: 'Ground beef chimichurri sweet potato', day: 'Thursday' },
      { name: 'Chicken Peruvian', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 2, thursday: 1, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 3, thursday: 2, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 3, thursday: 2, notes: '' },
      { name: 'Ann', monday: 2, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Andy', monday: 0, thursday: 4, notes: 'High Protein no carbs' },
      { name: 'Daniel K', monday: 3, thursday: 2, notes: 'no broccoli' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '4oz' },
      { name: 'Henning', monday: 6, thursday: 6, notes: 'Trying to eat more proteine' },
      { name: 'Zoey', monday: 0, thursday: 0, notes: '' },
    ],
  },
  'Week of 7.12': {
    recipes: [
      { name: 'Chicken Kefta Parsley Rice', day: 'Monday' },
      { name: 'Turkey Meatballs Potatoes Zuccini', day: 'Monday' },
      { name: 'Orzo salad chicken', day: 'Thursday' },
      { name: 'Braised beef & rice', day: 'Thursday' },
    ],
    customers: [
      { name: 'Drew', monday: 1, thursday: 2, notes: 'No Quinoa' },
      { name: 'Kelly', monday: 1, thursday: 3, notes: '' },
      { name: 'Mr. Kelly LARGE', monday: 1, thursday: 3, notes: '' },
      { name: 'Ann', monday: 2, thursday: 2, notes: 'No beans, no gluten, no dairy' },
      { name: 'Andy', monday: 0, thursday: 4, notes: 'High Protein no carbs' },
      { name: 'Daniel K', monday: 2, thursday: 4, notes: 'no broccoli' },
      { name: 'Felicia - Normal', monday: 4, thursday: 2, notes: '5oz of protein / 200 g potatoes' },
      { name: 'Felicia - No Carbs', monday: 4, thursday: 2, notes: '4oz' },
      { name: 'Henning', monday: 6, thursday: 6, notes: 'Trying to eat more proteine' },
      { name: 'Zoey', monday: 0, thursday: 0, notes: '' },
    ],
  },
};

async function importAllOrdersData() {
  try {
    console.log('📥 Importing ALL orders data from spreadsheet...\n');

    // First, clear existing data to avoid duplicates
    await db.query('DELETE FROM order_totals');
    await db.query('DELETE FROM menu_recipes');
    await db.query('DELETE FROM menus');
    console.log('Cleared existing data\n');

    let weekCount = 0;

    for (const [weekLabel, weekData] of Object.entries(allOrderData)) {
      console.log(`Processing ${weekLabel}...`);

      try {
        // Create menu
        const menuResult = await db.query(
          'INSERT INTO menus (week_label) VALUES ($1) RETURNING id',
          [weekLabel]
        );
        const menuId = menuResult.rows[0].id;

        // Insert recipes for this menu
        for (const recipe of weekData.recipes) {
          await db.query(
            'INSERT INTO menu_recipes (menu_id, recipe_name, day_of_week) VALUES ($1, $2, $3)',
            [menuId, recipe.name, recipe.day]
          );
        }

        // Insert customers and their orders
        for (const customer of weekData.customers) {
          // Upsert customer
          const customerResult = await db.query(
            'INSERT INTO customers (name, notes) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING id',
            [customer.name, customer.notes || null]
          );
          const customerId = customerResult.rows[0].id;

          // Calculate totals
          const totalMeals = customer.monday + customer.thursday;

          // Insert order total
          await db.query(
            `INSERT INTO order_totals (menu_id, customer_id, total_meals_monday, total_meals_thursday, total_meals)
             VALUES ($1, $2, $3, $4, $5)`,
            [menuId, customerId, customer.monday, customer.thursday, totalMeals]
          );
        }

        console.log(`  ✅ ${weekLabel}`);
        weekCount++;
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
      }
    }

    console.log(`\n✅ Successfully imported ${weekCount} weeks of orders data!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

importAllOrdersData();
