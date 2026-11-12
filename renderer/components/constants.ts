export const labels = [
    {title: 'In progress', theme: 'info'},
    {title: 'Open', theme: 'success'},
    {title: 'Testing', theme: 'unknown'},
    {title: 'Some mistakes', theme: 'danger'},
];

export const projects = [
    'WWCC - incorrect - fix',
    'ARC - down lux parameters',
    'ASMR - double',
    'WWCC - store',
    'LUX - programming',
    'DSLL - second screen',
    'ARC - exstamina',
    'ASMR - loader connections',
    'LUX - check',
    'DSLL - second screen with zoom',
];

export const users = [
    'John Smith',
    'David Jones',
    'Michael Johnson',
    'William Wilson',
    'Charles Carter',
    'Robert Rodriguez',
    'Alexander Adams',
];

export const tableData = new Array(10).fill(0).map((_, index) => {
    return {
        user: users[(index + 1) % 7],
        project: projects[(index + 1) % 10],
        updated: '10.03.2023 19:37',
        status: labels[(index + 1) % 4],
    };
});
