if (data.role_BD) {
	newSlots.role = data.role_BD;
	const a = {
		"Москва": {
			"Водитель СБ": "role_moscow_driver_sb",
		}
	}
	const CITY_TO_ROLE_SLOT = {
		"Москва": "role_moscow",
		"Сочи": "role_sochi",
		"Санкт-Петербург": "role_spb",
		"Видное": "role_vidnoye",
		"Калуга": "role_kaluga",
		"Московский": "role_moskovsky",
		"Подольск": "role_podolsk",
		"Орехово-Зуево": "role_orekhovo",
		"Электросталь": "role_elst",
		"Ногинск": "role_noginsk",
		"Серпухов": "role_serpukhov",
		"Чехов": "role_chekhov",
		"Другой город": "role_othercity"
	};

	newSlots[CITY_TO_ROLE_SLOT[data.city]] = a[data.city][data.role_BD] || a[data.city]["Другая роль"];
}
