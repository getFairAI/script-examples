from token_count import TokenCount

#Read Files
file_ltipp_analysis = open("/home/fair-node/Desktop/arb-hack/data/ltipp_analysis.txt", "r")
content_ltipp_analysis = file_ltipp_analysis.read()
file_ltipp_analysis.close()

file_amount_requested = open("/home/fair-node/Desktop/arb-hack/data/amount_requested.txt", "r")
content_amount_requested = file_amount_requested.read()
file_amount_requested.close()

file_general_description = open("/home/fair-node/Desktop/arb-hack/data/general_description.txt", "r")
content_general_description = file_general_description.read()
file_general_description.close()

file_good_post_ltipp = open("/home/fair-node/Desktop/arb-hack/data/proposals_with_good_results.txt", "r")
content_good_post_ltipp = file_good_post_ltipp.read()
file_good_post_ltipp.close()

file_deltaprime_results = open("/home/fair-node/Desktop/arb-hack/data/deltaprimeresults.txt", "r")
content_deltaprime_results = file_deltaprime_results.read()
file_deltaprime_results.close()

file_grant_goals = open("/home/fair-node/Desktop/arb-hack/data/grant_goals.txt", "r")
content_grant_goals = file_grant_goals.read()
file_grant_goals.close()

#print(content_ltipp_analysis)


prompt_result_amount = f""" Here is a list of projects that participated in Arbitrum's LTIPP (Long Term Incentives Pilot Program) and the amount of ARBs they requested: {content_amount_requested}

The program has already ended, and OpenBlock carried out the following study: {content_ltipp_analysis}


So using all this data that is more than enough I want your help to create a report in which the goal is to group projects according to the amount of ARBs they requested. I want you to discover patterns and analyze anything you can find in relation to the amount of money they requested and the result according to the OpenBlock report.
The report should be short.
"""
    

prompt_result_category = f""" Here is a list of projects that participated in Arbitrum's LTIPP (Long Term Incentives Pilot Program). This list contains the name, a short description, and how many ARBs they requested in their proposed grant. The list is as follows: {content_general_description}

The program has already ended, and OpenBlock carried out the following study: {content_ltipp_analysis}


I want you to create a report that groups projects by category and want you to discover patterns and analyze anything you can find in relation to the category they belong to and the result, according to the OpenBlock report.
The report should be short.
"""

prompt_top_five = f""" Here is a summary of the goals of the projects that received grants in Arbitrum's LTIPP program. {content_grant_goals}


These were the results they achieved: {content_ltipp_analysis} and {content_deltaprime_results}



Based on these data: What are the top 5 projects that have achieved success based on what they specified in their grant proposals?
"""    



prompt_good_post_ltipp = f""" {content_good_post_ltipp} 

These projects participated in Arbitrum's LTIPP (Long Term Incentives Pilot Program) and were successful. This was a resume of their grant goals. Can you find any patterns between them that could provide a justification for their success?
The report should be short.
"""   

prompt_result_deltaprime = f""" Here is a list of projects that participated in Arbitrum's LTIPP (Long Term Incentives Pilot Program). This list contains the name, a short description, and how many ARBs they requested in their proposed grant. The list is as follows: {content_general_description}

The program has already ended, and OpenBlock carried out the following study: {content_ltipp_analysis}


And the following study was done by Token Guard in relation to DeltaPrime results: {content_deltaprime_results}


I would appreciate your help in generating a report that analyzes how DeltaPrime performed compared to other projects within the same category (based on the project description). To do this, please use the general project information to identify which projects belong to the same category as DeltaPrime, and then compare the results from the OpenBlocks and Token Guard reports. Please provide a concise yet detailed response.
"""



prompts_map = {
    0: prompt_result_amount,
    1: prompt_result_category,
    2: prompt_top_five,
    3: prompt_good_post_ltipp,
    4: prompt_result_deltaprime
}

#
def count_text_tokens(content): 
    tc = TokenCount(model_name="gpt-3.5-turbo")
    return tc.num_tokens_from_string(content)


def get_prompt_by_question(id_question):
    return prompts_map.get(id_question,"Invalid question number")

    

