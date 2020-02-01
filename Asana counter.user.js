// ==UserScript==
// @name        Asana counter
// @namespace   test
// @description Asana counter
// @include     https://app.asana.com/*
// @version     1
// @grant       none
// @run-at      document-end
// @require     https://code.jquery.com/jquery-3.2.1.min.js
// @require     https://code.jquery.com/ui/1.12.1/jquery-ui.js
// @require     https://craig.global.ssl.fastly.net/js/mousetrap/mousetrap.min.js
// @require     https://raw.githubusercontent.com/uzairfarooq/arrive/master/minified/arrive.min.js
// ==/UserScript==

let runningSum = 0;
let selectedRows = {};

(function () {
    legacyMethodSetup();

    integratedMethodSetup();
})();

function integratedMethodSetup() {
    const task_rows = document.querySelectorAll("#grid tr,.TaskList .ItemRow");
    const taskObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            processRowEvent(mutation.target);
        });
    });

    function observeRow(row) {
        //this contraption needed to accommodate 2 types of rows that we can receive //tr and .ItemRow
        taskObserver.observe($(row).find(".ItemRow").addBack()[0], {
            attributeFilter: ["class"]
        });
    }

    task_rows.forEach(observeRow);

    let central_pane_selector = "#center_pane__contents:first .column-contents-on-click-below-content";

    $(central_pane_selector).arrive("#grid tr,.TaskList .ItemRow", function (newElement) {
        observeRow(newElement);
    });

    // For some reason this change is not detected in another observer. This one handles case when the task
    // gets completed
    $(central_pane_selector + " #grid").leave("tr", function (removedElement) {
        processRowEvent(removedElement);
    });

    $(central_pane_selector).arrive("#grid,.TaskList", function (newElement) {
        // When change project/view - deselection is not happening, so we need to cleanup ourselves.
        runningSum = 0;
        selectedRows = {};
    });

}

function processRowEvent(row) {
    const textArea = $(row).find("textarea");
    //console.log(textArea.val());
    const isSelected = $(row).is(".grid-row-selected,.ItemRow--highlighted,.ItemRow--focused");
    //console.log("isSelected: ", isSelected);
    let taskNum = getNumberFromTaskName(textArea.val());
    let dictKey = textArea[0].id;
    if (dictKey in selectedRows) {
        if (isSelected) {
            // handles the case when we change the value on the task, while it has stayed selected
            const diff = taskNum - selectedRows[dictKey];
            selectedRows[dictKey] += diff;
            runningSum += diff;
        } else {
            runningSum -= selectedRows[dictKey];
            delete selectedRows[dictKey];
        }
    } else if (!(dictKey in selectedRows) && isSelected) {
        selectedRows[dictKey] = taskNum;
        runningSum += taskNum;
    }
    //console.log(runningSum);
    if (Object.keys(selectedRows).length > 1) {
        displayResult(runningSum);
    }
}

function displayResult(resultNumber) {
    let panelTitle = $("#right_pane.multi-selected .header-name,.MultiTaskTitleRow .MultiTaskTitleRow-titleText")[0];
    if (!panelTitle) {
        return;
    }
    const currentTitle = panelTitle.textContent;
    let subStringEnd = currentTitle.indexOf("[");
    if (subStringEnd === -1) {
        subStringEnd = currentTitle.length;
    }
    panelTitle.textContent = currentTitle.substring(0, subStringEnd) + " [" + resultNumber + "]";
}

function getNumberFromTaskName(taskName) {
    const myRegexp = /\[([-+]?(\d+|\d+\.\d+))]/g;
    try {
        const match = myRegexp.exec(taskName);
        return parseFloat(match[1]);
    } catch (err) {
        return 0;
    }
}

function getDataFromRow(taskName) {
    const regexp = /\[(\+)?(\d+)(D)?(-|\+)?(\d+)?(D)?\]/g;
    const data = {
        hours: 0,
        moreHours: 0,
        lessHours: 0
    };

    try {
        const match = regexp.exec(taskName);

        // extract values
        [, preSign, hours, isDay, extraSign, extraHours, extraIsDay] = match;
        data.hours = isDay ? hours * 8 : hours * 1;

        if (preSign === "+") {
            data.moreHours = isDay ? hours * 8 : hours * 1;
        } else if (extraSign === "+") {
            if (extraHours) {
                data.moreHours = extraIsDay ? extraHours * 8 : extraHours * 1;
            }
        } else if (extraSign === "-") {
            if (extraHours) {
                data.lessHours = extraIsDay ? extraHours * 8 : extraHours * 1;
            }
        }

        return data;
    } catch (err) { }

    return data;
}

function legacyMethodSetup() {
    Mousetrap(document.body).bind(['command+k', 'ctrl+k'], function (e) {
        const summaryData = getSummaryFromSelectedTasks();
        const progress = summaryData.countAllTasks > 0 ? Math.round(summaryData.countCompletedTasks / summaryData.countAllTasks * 100) : 0;
        const difference = summaryData.totalHours - summaryData.plannedHours;

        let dialog = $('<div>', {title: 'Summary'});
        dialog.append($('<p>').append($('<strong>').append("Progress: "), progress, "%"));
        dialog.append($('<p>').append($('<strong>').append("Completed tasks / All tasks: "), summaryData.countCompletedTasks, " / ", summaryData.countAllTasks));
        dialog.append($('<hr>'));
        dialog.append($('<p>').append($('<strong>').append("Planned hours: "), summaryData.plannedHours));
        dialog.append($('<p>').append($('<strong>').append("Spent hours: "), summaryData.totalHours));
        dialog.append($('<p>').append($('<strong>').append("+/- hours: "), difference > 0 ? "+" : "", difference));
        dialog.dialog();

        return false;
    });

    injectStyle();
}

function getSummaryFromSelectedTasks() {
    const data = {
        countAllTasks: 0,
        countCompletedTasks: 0,
        totalHours: 0,
        plannedHours: 0
    };

    const relevantItems = $(".TaskList .ItemRow, #grid tr").not(".SectionRow");

    relevantItems.each(function (i, row) {
        const isSelected = $(row).is(".grid-row-selected,.ItemRow--highlighted,.ItemRow--focused");
        if (!isSelected) {
            return;
        }

        data.countAllTasks++;
        const isCompleted = $(".TaskRowCompletionStatus-checkbox--complete", row).length > 0;
        if (isCompleted) {
            data.countCompletedTasks++;
        }

        const rowData = getDataFromRow($(row).find("textarea").val());
        data.plannedHours += rowData.hours;
        data.totalHours += rowData.hours;

        if (rowData.moreHours > 0) {
            data.totalHours += rowData.moreHours;
        } else if (rowData.lessHours > 0) {
            data.totalHours -= rowData.lessHours;
        }
    });

    return data;
}

function getTotalCount() {
    let hours = 0;
    // legacy view
    $(".TaskList .ItemRow, #grid tr").each(function (i, row) {
        hours += getNumberFromRow(row);
    });
    // spreadsheet view
    $(".SpreadsheetGridScroller-container .SpreadsheetRow").each(function (i, row) {
        hours += getNumberFromRow(row);
    });

    return hours;
}

function getNumberFromRow(row) {
    if ($(row).is(".grid-row-selected,.ItemRow--highlighted,.ItemRow--focused")
        || $(row).is(".SpreadsheetRow--highlighted,.SpreadsheetTaskRow--focused")) {
        return getNumberFromTaskName($(row).find("textarea").val());
    }
    return 0;
}

function injectStyle() {
    $("head").append(
        $("<link>", {
            href: "https://code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css",
            type: "text/css",
            rel: "stylesheet"
        }));
}
